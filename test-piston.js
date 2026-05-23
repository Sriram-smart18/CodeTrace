async function test() {
  const pistonPayload = {
    language: "python",
    version: "3.10.0",
    files: [{ name: "main.py", content: "print('hello from node')" }],
  };

  const urls = [
    "https://piston.codes/api/v2/execute",
    "https://piston.devs.sh/api/v2/execute",
    "https://piston.run/api/v2/execute",
    "https://judge0-ce.p.rapidapi.com/submissions"
  ];

  for (const url of urls) {
    try {
      console.log("Testing", url);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pistonPayload),
      });

      const text = await res.text();
      console.log("Status:", res.status);
      console.log("Response:", text.substring(0, 200));
    } catch (e) {
      console.log("Error:", e.message);
    }
  }
}

test();
