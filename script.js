// ------------------ CONFIG (REPLACE) ------------------
// Firebase web app config - replace with your Firebase project's values
const firebaseConfig = {
  apiKey: "AIzaSyA82xkl46ZYkBErbqZSC5ZBOXFBGMMNBnk",
  authDomain: "ashutosh-dham-donation.firebaseapp.com",
  projectId: "ashutosh-dham-donation",
  storageBucket: "ashutosh-dham-donation.firebasestorage.app",
  messagingSenderId: "754520358363",
  appId: "1:754520358363:web:03b397e18f9b4b6739fbfe"
};

// Razorpay Key ID (test/live)
const RAZORPAY_KEY_ID = "YOUR_RAZORPAY_KEY_ID";
// -----------------------------------------------------

// Initialize Firebase (compat)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ui init
document.getElementById('year').innerText = new Date().getFullYear();

// Hero slider auto
(function heroSlider(){
  const slides = document.querySelectorAll('.hero .slide');
  if(!slides || slides.length === 0) return;
  let idx = 0;
  setInterval(()=> {
    slides[idx].classList.remove('show');
    idx = (idx+1) % slides.length;
    slides[idx].classList.add('show');
  }, 6000);
})();

// Lightbox
function openLightbox(src){
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  img.src = src;
  lb.style.display = 'flex';
}
function closeLightbox(){ document.getElementById('lightbox').style.display = 'none'; }

// scroll to donate
function scrollToDonate(){ const el = document.getElementById('donationAmount') || document.querySelector('#donate'); if(el) el.scrollIntoView({behavior:'smooth', block:'center'}); }
const previewBtn = document.getElementById('previewBtn');
const donateBtn = document.getElementById('rzp-button');
const inputs = ['donorName','donorEmail','donorPhone','donorAddress','donationAmount'];

let hasPreviewed = false;

// enable donate only after preview OR if you want remove this constraint, comment lines that check hasPreviewed
function validateForm(){
  const name = document.getElementById('donorName').value.trim();
  const phone = document.getElementById('donorPhone').value.trim();
  const amount = document.getElementById('donationAmount').value.trim();
  return name && phone && amount && !isNaN(amount) && Number(amount) > 0;
}

// Preview ID Card (temporary preview before donation)
previewBtn.addEventListener('click', (e) => {
  if(!validateForm()){
    alert('Please fill Name, Mobile and Amount to preview ID card.');
    return;
  }
  const name = document.getElementById('donorName').value.trim();
  const amount = document.getElementById('donationAmount').value.trim();
  const tmpId = 'PREVIEW-' + Date.now();
  generateIDCard({ name, amount, paymentId: tmpId, preview:true });
  hasPreviewed = true;
  donateBtn.disabled = false;
});

// Donate flow (Razorpay)
donateBtn.addEventListener('click', async (e) => {
  if(!validateForm()){
    alert('Please fill Name, Mobile and Amount before donating.');
    return;
  }
  // optional: force preview first
  if(!hasPreviewed){
    if(!confirm('You did not preview the ID card yet. Proceed to donate without preview?')) return;
  }

  const name = document.getElementById('donorName').value.trim();
  const email = document.getElementById('donorEmail').value.trim();
  const phone = document.getElementById('donorPhone').value.trim();
  const address = document.getElementById('donorAddress').value.trim();
  const donationType = document.getElementById('donationType').value;
  const amountStr = document.getElementById('donationAmount').value.trim();
  const isPublic = document.getElementById('publicName').checked;
  const amountPaise = Math.round(Number(amountStr) * 100);

  const options = {
    key: RAZORPAY_KEY,
    amount: amountPaise,
    currency: "INR",
    name: "Ashutosh Dham",
    description: donationType,
    prefill: { name, email, contact: phone },
    notes: { donationType },
    theme: { color: "#d9a441" },
    handler: async function (response) {
      const paymentId = response.razorpay_payment_id || ('PAY' + Date.now());
      // Save to Firestore
      try {
        await db.collection('donations').add({
          name, email, phone, address,
          donationType,
          public: !!isPublic,
          amount: Number(amountStr),
          paymentId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (err) {
        console.error('Firestore save error', err);
      }
      // Generate final receipt & ID card (with real payment id)
      generateReceipt({ name, email, amount: amountStr, paymentId, donationType });
      generateIDCard({ name, amount: amountStr, paymentId, preview:false });
      alert('धन्यवाद! Donation successful. Payment ID: ' + paymentId);
      // clear amount only
      document.getElementById('donationAmount').value = '';
      hasPreviewed = false;
      donateBtn.disabled = true;
    },
    modal: { ondismiss: function(){ console.log('Razorpay popup closed'); } }
  };

  const rzp = new Razorpay(options);
  rzp.open();
});
// Donate flow (no login)
const payBtn = document.getElementById('rzp-button');
const offlineBtn = document.getElementById('offlineBtn');

payBtn.addEventListener('click', startRazorpay);
offlineBtn.addEventListener('click', ()=> alert('Scan the UPI QR on the left or use the UPI ID to donate offline.'));

// ---------- Live counter & donor wall listeners ----------
function setupLiveListeners() {
  // Live total & donor count
  db.collection('donations').onSnapshot(snapshot => {
    let total = 0;
    let count = 0;
    const thisMonth = new Date().getMonth();
    let monthSum = 0;

    snapshot.forEach(doc => {
      const d = doc.data();
      const amt = Number(d.amount || 0);
      total += amt;
      count += 1;

      // month sum
      const created = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate() : (d.date ? new Date(d.date) : null);
      if (created && created.getMonth && created.getMonth() === thisMonth) monthSum += amt;
    });

    document.getElementById('liveTotal').innerText = `₹ ${total.toLocaleString('en-IN')}`;
    document.getElementById('donorCount').innerText = `${count}`;
    document.getElementById('monthTotal').innerText = `₹ ${monthSum.toLocaleString('en-IN')}`;
  });

  // Donor wall (last 10 public donors)
  db.collection('donations')
    .where('public', '==', true)
    .orderBy('createdAt', 'desc')
    .limit(10)
    .onSnapshot(snap => {
      const ul = document.getElementById('donorWallList');
      ul.innerHTML = '';
      snap.forEach(doc => {
        const d = doc.data();
        const name = d.name || 'Devotee';
        const amt = d.amount || 0;
        const short = `${name} • ₹${amt}`;
        const li = document.createElement('li');
        li.innerText = short;
        ul.appendChild(li);
      });
      if (ul.children.length === 0) {
        ul.innerHTML = '<li>No donors yet — be the first 🙏</li>';
      }
    });
}
setupLiveListeners();

// ---------- Payment + Save ----------
async function startRazorpay(e){
  const name = (document.getElementById('donorName').value || '').trim();
  const email = (document.getElementById('donorEmail').value || '').trim();
  const phone = (document.getElementById('donorPhone').value || '').trim();
  const address = (document.getElementById('donorAddress').value || '').trim();
  const donationType = (document.getElementById('donationType').value || 'General');
  const amountStr = (document.getElementById('donationAmount').value || '').trim();
  const isPublic = document.getElementById('publicName').checked;

  if(!name || !phone || !amountStr || isNaN(amountStr) || Number(amountStr) <= 0){
    alert('Please fill valid Name, Mobile and Amount.');
    return;
  }

  const amountPaise = Math.round(Number(amountStr) * 100);

  const options = {
    key: RAZORPAY_KEY_ID,
    amount: amountPaise,
    currency: "INR",
    name: "Ashutosh Dham",
    description: donationType,
    image: "images/temple-logo.png",
    prefill: { name: name, email: email, contact: phone },
    notes: { donor_name: name, donor_phone: phone, donation_type: donationType },
    theme: { color: "#d9a441" },
    handler: async function (response) {
      const pid = response.razorpay_payment_id || ('PAY' + Date.now());
      const paid = (amountPaise / 100).toFixed(2);
      const createdAt = firebase.firestore.FieldValue.serverTimestamp();

      // Save to Firestore
      try {
        await db.collection('donations').add({
          name,
          email,
          phone,
          address,
          donationType,
          public: !!isPublic,
          amount: Number(paid),
          paymentId: pid,
          method: 'razorpay',
          createdAt
        });
      } catch (err) {
        console.error('Error saving donation to Firestore:', err);
        alert('Donation succeeded but saving to database failed. Contact admin.');
      }

      // Generate PDFs client-side
      generateReceipt(name, email, paid, pid, donationType);
      generateIDCard(name, paid, pid);

      alert('धन्यवाद! Donation successful. Payment ID: ' + pid);
      // optional: clear amount and keep others
      document.getElementById('donationAmount').value = '';
    },
    modal: { ondismiss: function(){ console.log('Razorpay popup closed'); } }
  };

  const rzp = new Razorpay(options);
  rzp.open();
  e && e.preventDefault();
}

// jsPDF receipt (adds donation type)
function generateReceipt(name, email, amount, pid, donationType = '') {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16); doc.setTextColor(43,26,16);
  doc.text("Ashutosh Dham — Donation Receipt", 20, 20);
  doc.setFontSize(11);
  doc.text(`Donor: ${name}`, 20, 36);
  if(email) doc.text(`Email: ${email}`, 20, 44);
  if(donationType) doc.text(`Purpose: ${donationType}`, 20, 52);
  doc.text(`Amount: ₹${amount}`, 20, 60);
  doc.text(`Payment ID: ${pid}`, 20, 68);
  doc.text(`Date: ${new Date().toLocaleString('en-IN', {timeZone:'Asia/Kolkata'})}`, 20, 76);
  doc.setFontSize(9);
  doc.text("Thank you for your generous donation to Ashutosh Dham. Please keep this receipt for your records.", 20, 94, { maxWidth: 170 });
  doc.save(`Receipt_${pid}.pdf`);
}

// jsPDF ID card
function generateIDCard(name, amount, pid){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: [85, 55] });
  doc.setFillColor(217,164,65);
  doc.rect(0, 0, 85, 55, 'F');
  try { doc.addImage('images/temple-logo.png', 'PNG', 6, 6, 18, 18); } catch(e){}
  doc.setTextColor(43,26,16);
  doc.setFontSize(9);
  doc.text("Ashutosh Dham — Donor ID", 32, 14);
  doc.setFontSize(8);
  doc.text(`Name: ${name}`, 8, 30);
  doc.text(`Donation: ₹${amount}`, 8, 36);
  doc.text(`Payment ID: ${pid}`, 8, 42);
  doc.text(`Issued: ${new Date().toLocaleDateString('en-IN')}`, 8, 50);
  doc.save(`DonorID_${pid}.pdf`);
}

// init listeners (already called earlier)
// setupLiveListeners();

