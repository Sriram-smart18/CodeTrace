import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://fnvkthngkbrodsmjbuft.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZudmt0aG5na2Jyb2RzbWpidWZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTc1NjUsImV4cCI6MjA5NTAzMzU2NX0.nuss2l7nCiVqDtKWg6JV4Jcszk2VjENa0UvCUSwK8Kk";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const res = await supabase.auth.signInAnonymously();
  console.log("Anonymous Sign In Response:", JSON.stringify(res, null, 2));
}

run();
