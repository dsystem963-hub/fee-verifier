import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { CheckCircle, AlertCircle, Loader2, Upload, Globe, User, GraduationCap, DollarSign, LayoutDashboard } from 'lucide-react';

const API_BASE = 'http://localhost:5000/api/v1';

function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isInternational, setIsInternational] = useState(false);
  const [tid, setTid] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('idle'); // idle, loading, verified, pending, error
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    course: '',
    amount: '',
    currency: 'PKR',
    source: '',
  });
  const [receipt, setReceipt] = useState(null);
  const [message, setMessage] = useState('');

  // Admin state
  const [admissions, setAdmissions] = useState([]);

  useEffect(() => {
    if (isAdmin) {
      fetchAdmissionsStatus();
    }
  }, [isAdmin]);

  const fetchAdmissionsStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE}/admin/admissions-status`);
      setAdmissions(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const pakBanks = [
    "Habib Bank Limited (HBL)", "United Bank Limited (UBL)", "National Bank of Pakistan (NBP)",
    "MCB Bank Limited", "Allied Bank Limited (ABL)", "Bank Alfalah Limited",
    "Bank AL Habib Limited", "Askari Bank Limited", "Faysal Bank Limited",
    "Soneri Bank Limited", "JS Bank Limited", "Habib Metropolitan Bank",
    "The Bank of Punjab (BOP)", "Sindh Bank Limited", "Meezan Bank Limited",
    "BankIslami Pakistan", "Dubai Islamic Bank", "Al Baraka Bank",
    "Standard Chartered", "Samba Bank"
  ];

  const verifyTid = async (val) => {
    if (val.length < 5) return;
    setVerificationStatus('loading');
    try {
      const res = await axios.get(`${API_BASE}/verify-payment/${val}`);
      if (res.data.verified) {
        setVerificationStatus('verified');
        setFormData({ ...formData, amount: res.data.data.amount, source: res.data.data.payment_source });
      } else {
        setVerificationStatus('pending');
      }
    } catch (err) {
      setVerificationStatus('error');
    }
  };

  const handleTidChange = (e) => {
    const val = e.target.value;
    setTid(val);
    if (!isInternational) {
      const timeoutId = setTimeout(() => verifyTid(val), 1000);
      return () => clearTimeout(timeoutId);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    if (isInternational) {
      const data = new FormData();
      data.append('fullName', formData.fullName);
      data.append('email', formData.email);
      data.append('transaction_id', tid);
      data.append('amount', formData.amount);
      data.append('currency', formData.currency);
      data.append('payment_source', formData.source);
      data.append('receipt', receipt);

      try {
        await axios.post(`${API_BASE}/admission/international-payment`, data);
        setMessage('Success! Your international payment evidence has been submitted for manual approval.');
        setTid('');
        setReceipt(null);
      } catch (err) {
        setMessage('Error submitting payment evidence.');
      }
    } else {
      try {
        await axios.post(`${API_BASE}/admission/submit`, {
          fullName: formData.fullName,
          email: formData.email,
          tid,
          source: formData.source,
          amount: formData.amount,
          currency: 'PKR'
        });
        setMessage('Success! Your admission form has been submitted. We are matching your payment in the background.');
        setTid('');
      } catch (err) {
        setMessage('Error submitting admission form.');
      }
    }
  };

  const approvePayment = async (tid) => {
    // Need to find the payment log ID for this TID
    try {
      const res = await axios.get(`${API_BASE}/admin/approvals`);
      const payment = res.data.find(p => p.transaction_id === tid);
      if (payment) {
        await axios.post(`${API_BASE}/admin/approve`, { id: payment.id });
        fetchAdmissionsStatus();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (isAdmin) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8">
        <div className="max-w-7xl mx-auto">
          <header className="flex justify-between items-center mb-8 border-b border-slate-700 pb-4">
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <LayoutDashboard className="text-blue-400" /> Admissions Overview
            </h1>
            <button onClick={() => setIsAdmin(false)} className="px-4 py-2 bg-slate-800 rounded hover:bg-slate-700 transition">
              Student View
            </button>
          </header>

          <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/50 border-b border-slate-700">
                  <th className="p-4 font-semibold text-slate-400">Student Name</th>
                  <th className="p-4 font-semibold text-slate-400">Email</th>
                  <th className="p-4 font-semibold text-slate-400">TID / Ref</th>
                  <th className="p-4 font-semibold text-slate-400">Amount</th>
                  <th className="p-4 font-semibold text-slate-400">Source</th>
                  <th className="p-4 font-semibold text-slate-400">Verification Status</th>
                  <th className="p-4 font-semibold text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admissions.map((row) => (
                  <tr key={row.id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition">
                    <td className="p-4 font-medium">{row.full_name}</td>
                    <td className="p-4 text-slate-400">{row.email}</td>
                    <td className="p-4 font-mono text-sm">{row.transaction_id}</td>
                    <td className="p-4">{row.amount} {row.currency}</td>
                    <td className="p-4 text-sm capitalize">{row.source}</td>
                    <td className="p-4">
                      {row.payment_status === 'Verified' ? (
                        <span className="flex items-center gap-1 text-green-500 font-semibold px-2 py-1 bg-green-500/10 rounded-full w-fit text-xs">
                          <CheckCircle size={14} /> Verified
                        </span>
                      ) : row.payment_status === 'Pending' ? (
                        <span className="flex items-center gap-1 text-yellow-500 font-semibold px-2 py-1 bg-yellow-500/10 rounded-full w-fit text-xs">
                          <AlertCircle size={14} /> Pending Approval
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-slate-500 font-semibold px-2 py-1 bg-slate-500/10 rounded-full w-fit text-xs">
                          <Loader2 size={14} className="animate-spin" /> Matching...
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      {row.payment_status === 'Pending' && (
                        <button onClick={() => approvePayment(row.transaction_id)} className="text-xs bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded transition">
                          Approve Payment
                        </button>
                      )}
                      {row.receipt_image_url && (
                        <a href={`http://localhost:5000${row.receipt_image_url}`} target="_blank" rel="noreferrer" className="text-xs text-blue-400 underline ml-2">View Receipt</a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {admissions.length === 0 && (
              <p className="p-20 text-center text-slate-500 italic">No admission requests yet.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 text-center relative">
          <GraduationCap className="mx-auto mb-4 opacity-30" size={60} />
          <h2 className="text-3xl font-bold mb-2">Student Admission Form</h2>
          <p className="text-blue-100 opacity-80">Global Education Portal 2026</p>
          <button onClick={() => setIsAdmin(true)} className="absolute top-4 right-4 text-xs bg-black/20 px-2 py-1 rounded">Admin</button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-700">
            <div className="flex items-center gap-3">
              <Globe className={isInternational ? "text-blue-400" : "text-slate-500"} />
              <div>
                <p className="font-semibold">{isInternational ? 'International Student' : 'Domestic Student'}</p>
                <p className="text-xs text-slate-500">{isInternational ? 'Payment via Wise, WU, Remitly' : 'Payment via EasyPaisa, JazzCash, Banks'}</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={isInternational} onChange={(e) => {
                setIsInternational(e.target.checked);
                setTid('');
                setVerificationStatus('idle');
                setFormData({ ...formData, source: '', amount: '' });
              }} className="sr-only peer" />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                <User size={16} /> Full Name
              </label>
              <input type="text" required placeholder="John Doe" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 outline-none focus:border-blue-500" value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                <AlertCircle size={16} /> Email Address
              </label>
              <input type="email" required placeholder="john@example.com" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 outline-none focus:border-blue-500" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
            </div>
          </div>

          <div className="space-y-4 border-t border-slate-700 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400">Payment Source</label>
                {!isInternational ? (
                  <select required className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 outline-none focus:border-blue-500 capitalize" value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })}>
                    <option value="">Select Platform / Bank</option>
                    <option value="EasyPaisa">EasyPaisa</option>
                    <option value="JazzCash">JazzCash</option>
                    <option value="SadaPay">SadaPay</option>
                    <option value="NayaPay">NayaPay</option>
                    <optgroup label="Banks in Pakistan">
                      {pakBanks.map(bank => <option key={bank} value={bank}>{bank}</option>)}
                    </optgroup>
                  </select>
                ) : (
                  <select required className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3" value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })}>
                    <option value="">Select Option</option>
                    <option value="Wise">Wise</option>
                    <option value="Remitly">Remitly</option>
                    <option value="Western Union">Western Union</option>
                    <option value="Payoneer">Payoneer</option>
                  </select>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400">Amount Paid</label>
                <div className="flex gap-2">
                  <input type="number" required placeholder="5000" className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-3 outline-none focus:border-blue-500" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} />
                  {isInternational && (
                    <select className="bg-slate-900 border border-slate-700 rounded-lg p-3" value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })}>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="PKR">PKR</option>
                    </select>
                  )}
                  {!isInternational && <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-500 px-4">PKR</div>}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                <DollarSign size={16} /> {isInternational ? 'Reference Number / MTCN' : 'Transaction ID (TID)'}
              </label>
              <div className="relative">
                <input type="text" required placeholder={isInternational ? "Enter MTCN or Ref Code" : "Enter 11-digit TID"} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 pr-12 outline-none focus:border-blue-500" value={tid} onChange={handleTidChange} />
                <div className="absolute right-3 top-3">
                  {verificationStatus === 'loading' && <Loader2 className="animate-spin text-blue-500" size={20} />}
                  {verificationStatus === 'verified' && <CheckCircle className="text-green-500" size={20} />}
                  {verificationStatus === 'pending' && <AlertCircle className="text-yellow-500" size={20} />}
                  {verificationStatus === 'error' && <AlertCircle className="text-red-500" size={20} />}
                </div>
              </div>
              
              {!isInternational && verificationStatus === 'pending' && (
                <p className="text-xs text-yellow-500 mt-1">Status: Matching with SMS gateway bank records... You can submit now.</p>
              )}
              {!isInternational && verificationStatus === 'verified' && (
                <p className="text-xs text-green-500 mt-1 font-semibold">Payment Successfully Verified! Source: {formData.source}</p>
              )}
            </div>

            {isInternational && (
              <div className="col-span-full space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                  <Upload size={16} /> Digital Receipt / Evidence
                </label>
                <div className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center hover:border-blue-500 transition cursor-pointer relative">
                  <input type="file" required={isInternational} className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => setReceipt(e.target.files[0])} />
                  <Upload className="mx-auto text-slate-500 mb-2" />
                  <p className="text-sm text-slate-400">{receipt ? receipt.name : 'Upload Screenshot or PDF'}</p>
                </div>
              </div>
            )}
          </div>

          {message && (
            <div className={`p-4 rounded-lg flex items-center gap-3 ${message.includes('Success') ? 'bg-green-500/10 text-green-400 border border-green-500/50' : 'bg-red-500/10 text-red-400 border border-red-500/50'}`}>
              <CheckCircle size={20} /> {message}
            </div>
          )}

          <button type="submit" className="w-full py-4 rounded-xl font-bold text-lg transition shadow-lg bg-blue-600 hover:bg-blue-500 text-white">
            Submit Admission Form
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
