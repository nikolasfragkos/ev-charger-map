const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

(async () => {
  try {
    console.log("Loading demo chargers...\n");
    
    // Step 1: Login
    const loginRes = await fetch("http://localhost:3000/api/v1/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@ev.local", password: "admin123" })
    });
    
    if (!loginRes.ok) {
      console.log("❌ Login failed:", loginRes.status, await loginRes.text());
      return;
    }
    
    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log("✅ Logged in as admin");
    
    // Step 2: Reset points
    const resetRes = await fetch("http://localhost:3000/api/v1/admin/resetpoints", {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });
    
    if (!resetRes.ok) {
      console.log("❌ Reset failed:", resetRes.status, await resetRes.text());
      return;
    }
    
    const resetData = await resetRes.json();
    console.log("✅ " + resetData.message);
    console.log("\n✨ Demo data loaded successfully!");
    
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
})();
