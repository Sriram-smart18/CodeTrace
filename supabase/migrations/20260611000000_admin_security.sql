-- ============================================================
-- TraceCode V3 Database Migration: Admin User Management Security
-- ============================================================

-- 1. Add is_deleted column to public.profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- 2. Add database-level unique indexes to ensure at most one admin exists
CREATE UNIQUE INDEX IF NOT EXISTS only_one_admin_role
  ON public.user_roles (role)
  WHERE (role = 'admin');

CREATE UNIQUE INDEX IF NOT EXISTS only_one_admin_profile
  ON public.profiles (role)
  WHERE (role = 'admin');

-- 3. Update handle_new_user trigger function to block admin role escalation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role public.app_role;
BEGIN
  v_role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'student');
  
  -- Force escalate any attempted 'admin' signup role to 'student'
  IF v_role = 'admin' THEN
    v_role := 'student';
  END IF;

  INSERT INTO public.profiles (user_id, name, email, role, uid)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    v_role,
    NEW.raw_user_meta_data->>'uid'
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    v_role
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Create trigger function to enforce administrator role and profile safeguards
CREATE OR REPLACE FUNCTION public.enforce_admin_security_profiles()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent deletion of admin profile
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'admin' THEN
      RAISE EXCEPTION 'Security Violation: The system administrator account cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;

  -- Block direct API creation of administrator profiles
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'admin' THEN
      IF auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION 'Security Violation: Direct API creation of administrator profile is prohibited.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Protect admin role and suspension status updates
  IF TG_OP = 'UPDATE' THEN
    -- Admin cannot be suspended
    IF OLD.role = 'admin' AND NEW.is_suspended = true THEN
      RAISE EXCEPTION 'Security Violation: The administrator account cannot be suspended.';
    END IF;

    -- Admin cannot be soft-deleted
    IF OLD.role = 'admin' AND NEW.is_deleted = true THEN
      RAISE EXCEPTION 'Security Violation: The administrator account cannot be deleted.';
    END IF;

    -- Admin role cannot be modified (no demotion)
    IF OLD.role = 'admin' AND NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Security Violation: The administrator role cannot be modified.';
    END IF;

    -- Prevent escalating any user to admin
    IF NEW.role = 'admin' AND OLD.role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Security Violation: Cannot escalate to administrator role.';
    END IF;

    -- Prevent non-admin users from changing roles or suspension status
    IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_suspended IS DISTINCT FROM OLD.is_suspended OR NEW.is_deleted IS DISTINCT FROM OLD.is_deleted) THEN
      IF NOT public.has_role(auth.uid(), 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only administrators can modify roles or deactivation status.';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Create trigger function to enforce user_roles safeguards
CREATE OR REPLACE FUNCTION public.enforce_admin_security_roles()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent deletion of admin role
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'admin' THEN
      RAISE EXCEPTION 'Security Violation: The system administrator role cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;

  -- Prevent inserting admin role through APIs
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'admin' THEN
      IF auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION 'Security Violation: Direct API creation of administrator role is prohibited.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Prevent updating admin role mapping
  IF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'admin' OR NEW.role = 'admin' THEN
      RAISE EXCEPTION 'Security Violation: Administrator role modifications are not allowed.';
    END IF;
    
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Unauthorized: Only administrators can modify roles.';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Attach triggers to tables
DROP TRIGGER IF EXISTS protect_profiles_admin ON public.profiles;
CREATE TRIGGER protect_profiles_admin
  BEFORE INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_security_profiles();

DROP TRIGGER IF EXISTS protect_roles_admin ON public.user_roles;
CREATE TRIGGER protect_roles_admin
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_security_roles();

-- 7. Update RLS policies to handle is_deleted filter automatically
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id AND is_deleted = false);

DROP POLICY IF EXISTS "Teachers can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Teachers can view active profiles" ON public.profiles;
CREATE POLICY "Teachers can view active profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'teacher') AND is_deleted = false);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id AND is_deleted = false);

DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
CREATE POLICY "Admin can view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admin can update all profiles" ON public.profiles;
CREATE POLICY "Admin can update all profiles" ON public.profiles
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- 8. Add trigger to sync profiles role changes to user_roles automatically
CREATE OR REPLACE FUNCTION public.sync_profile_role_to_user_roles()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    UPDATE public.user_roles
    SET role = NEW.role
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS sync_profile_role_to_user_roles_trg ON public.profiles;
CREATE TRIGGER sync_profile_role_to_user_roles_trg
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_role_to_user_roles();
