//back-end/test-auth.js
// Run this with: node test-auth.js

const BASE_URL = 'http://localhost:9876/api/v1';

async function testAuth() {
  console.log('🚀 Starting Auth Tests...\n');

  // 1. SIGN UP (New User)
  const randomEmail = `testuser_${Date.now()}@example.com`;
  const password = 'password123';
  
  console.log(`1️⃣  Testing SignUp (${randomEmail})...`);
  const signUpRes = await fetch(`${BASE_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: randomEmail, password })
  });
  
  if (signUpRes.status === 201) console.log('✅ SignUp Successful');
  else console.error('❌ SignUp Failed', await signUpRes.json());

  // 2. SIGN IN (Get Token)
  console.log(`\n2️⃣  Testing SignIn...`);
  const signInRes = await fetch(`${BASE_URL}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: randomEmail, password })
  });

  const signInData = await signInRes.json();
  if (signInRes.status === 200 && signInData.token) {
    console.log('✅ SignIn Successful. Token received.');
  } else {
    console.error('❌ SignIn Failed', signInData);
    return; // Stop if login fails
  }

  const USER_TOKEN = signInData.token;

  // 3. ACCESS PROTECTED ROUTE (/me)
  console.log(`\n3️⃣  Testing Protected Route (/me) with User Token...`);
  const meRes = await fetch(`${BASE_URL}/me`, {
    headers: { 'Authorization': `Bearer ${USER_TOKEN}` }
  });
  const meData = await meRes.json();
  
  if (meRes.status === 200 && meData.email === randomEmail) {
    console.log('✅ Access Granted. Profile retrieved.');
  } else {
    console.error('❌ Access Failed', meData);
  }

  // 4. TRY ADMIN ROUTE AS USER (Should Fail)
  console.log(`\n4️⃣  Testing Admin Route with User Token (Should Fail)...`);
  const adminFailRes = await fetch(`${BASE_URL}/admin/healthcheck`, {
    headers: { 'Authorization': `Bearer ${USER_TOKEN}` }
  });
  
  if (adminFailRes.status === 403) {
    console.log('✅ correctly blocked non-admin user (403 Forbidden).');
  } else {
    console.error(`❌ Unexpected status code: ${adminFailRes.status}`);
  }

  // 5. SIGN IN AS ADMIN (Seeded User)
  console.log(`\n5️⃣  Testing Admin Login (admin@ev.local)...`);
  const adminLoginRes = await fetch(`${BASE_URL}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@ev.local', password: 'admin123' })
  });
  
  const adminData = await adminLoginRes.json();
  if (!adminData.token) {
    console.error('❌ Admin login failed. Did you run "npx prisma db seed"?');
    return;
  }
  const ADMIN_TOKEN = adminData.token;
  console.log('✅ Admin Login Successful.');

  // 6. ACCESS ADMIN ROUTE AS ADMIN
  console.log(`\n6️⃣  Testing Admin Route with Admin Token...`);
  const adminSuccessRes = await fetch(`${BASE_URL}/admin/users`, {
    headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
  });

  if (adminSuccessRes.status === 200) {
    console.log('✅ Admin Access Granted.');
  } else {
    console.error(`❌ Admin Access Failed: ${adminSuccessRes.status}`);
  }

  console.log('\n🏁 Tests Completed.');
}

testAuth();