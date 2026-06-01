import { useState } from "react";
import { Check, X, Eye, EyeOff } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface PasswordValidatorProps {
  value: string;
  onChange: (value: string) => void;
  confirmValue?: string;
  onConfirmChange?: (value: string) => void;
  showConfirmField?: boolean;
  onValidityChange?: (isValid: boolean) => void;
  id?: string;
  placeholder?: string;
  className?: string;
}

export function PasswordValidator({
  value,
  onChange,
  confirmValue = "",
  onConfirmChange,
  showConfirmField = false,
  onValidityChange,
  id = "password",
  placeholder = "••••••••",
  className,
}: PasswordValidatorProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Criteria
  const hasMinLength = value.length >= 8;
  const hasUppercase = /[A-Z]/.test(value);
  const hasLowercase = /[a-z]/.test(value);
  const hasNumber = /\d/.test(value);
  const hasSpecial = /[@$!%*?&]/.test(value);

  const criteria = [
    { label: "Minimum 8 characters", met: hasMinLength },
    { label: "At least 1 uppercase letter", met: hasUppercase },
    { label: "At least 1 lowercase letter", met: hasLowercase },
    { label: "At least 1 number", met: hasNumber },
    { label: "At least 1 special character (@$!%*?&)", met: hasSpecial },
  ];

  const metCount = criteria.filter((c) => c.met).length;
  
  // Strict check using exact required regex
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
  const isStrictlyValid = regex.test(value);

  // Match check
  const passwordsMatch = confirmValue === "" ? false : value === confirmValue;
  const allValid = isStrictlyValid && (!showConfirmField || passwordsMatch);

  // Notify parent component of validity state
  if (onValidityChange) {
    // Run this inside a timeout to avoid react render-phase warning updates
    setTimeout(() => {
      onValidityChange(allValid);
    }, 0);
  }

  // Calculate Strength Indicator
  let strengthLabel = "Weak";
  let strengthColor = "bg-destructive";
  let progressVal = 20;

  if (metCount === 5) {
    strengthLabel = "Strong";
    strengthColor = "bg-success";
    progressVal = 100;
  } else if (metCount >= 3) {
    strengthLabel = "Medium";
    strengthColor = "bg-warning";
    progressVal = 60;
  } else if (metCount > 0) {
    strengthLabel = "Weak";
    strengthColor = "bg-destructive";
    progressVal = 30;
  } else {
    strengthLabel = "Very Weak";
    strengthColor = "bg-destructive/30";
    progressVal = 5;
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-1.5 relative">
        <div className="relative">
          <input
            id={id}
            type={showPassword ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required
            placeholder={placeholder}
            className="flex h-10 w-full rounded-md border border-white/10 bg-background/50 px-3 py-2 pr-10 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
            aria-label="Enter Password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground focus:outline-none"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Strength indicator visual */}
      {value && (
        <div className="space-y-1.5 animate-fadeIn">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-muted-foreground">Password Strength:</span>
            <span className={cn(
              metCount === 5 ? "text-success" : metCount >= 3 ? "text-warning" : "text-destructive"
            )}>{strengthLabel}</span>
          </div>
          <Progress value={progressVal} className="h-1.5 bg-white/5" indicatorClassName={strengthColor} />
        </div>
      )}

      {/* Checklist */}
      <div className="rounded-lg border border-white/5 bg-black/10 p-3.5 space-y-2 text-xs">
        <span className="font-semibold text-muted-foreground block mb-1">Requirement Checklist:</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 font-sans">
          {criteria.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              {c.met ? (
                <Check className="h-3.5 w-3.5 text-success flex-shrink-0" />
              ) : (
                <X className="h-3.5 w-3.5 text-muted-foreground/45 flex-shrink-0" />
              )}
              <span className={cn(
                "transition-colors",
                c.met ? "text-success font-medium" : "text-muted-foreground"
              )}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Confirm Password field */}
      {showConfirmField && onConfirmChange && (
        <div className="space-y-2">
          <label htmlFor={`${id}-confirm`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-75">
            Confirm Password
          </label>
          <div className="relative">
            <input
              id={`${id}-confirm`}
              type={showConfirmPassword ? "text" : "password"}
              value={confirmValue}
              onChange={(e) => onConfirmChange(e.target.value)}
              required
              placeholder="••••••••"
              className="flex h-10 w-full rounded-md border border-white/10 bg-background/50 px-3 py-2 pr-10 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
              aria-label="Confirm Password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground focus:outline-none"
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {confirmValue && (
            <p className={cn(
              "text-xs flex items-center gap-1.5 font-medium animate-fadeIn",
              passwordsMatch ? "text-success" : "text-destructive"
            )}>
              {passwordsMatch ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Passwords match
                </>
              ) : (
                <>
                  <X className="h-3.5 w-3.5" /> Passwords do not match
                </>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
