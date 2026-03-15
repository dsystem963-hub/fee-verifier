import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LayoutDashboard, CheckCircle, AlertCircle, Loader2, Globe, User, GraduationCap, DollarSign, Upload, FileDown, Image as ImageIcon, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';

const API_BASE = '/api/v1';

function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isInternational, setIsInternational] = useState(false);
  const [tid, setTid] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('idle'); // idle, loading, verified, pending, error
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    mobileNumber: '',
    cnic: '',
    course: '',
    courseDescription: '', // NEW
    amount: '',
    currency: 'PKR',
    source: '',
    idType: '', // NEW
  });
  const [receipt, setReceipt] = useState(null);
  const [message, setMessage] = useState('');
  const [showCourseOptions, setShowCourseOptions] = useState(false); // NEW
  const [adminAuth, setAdminAuth] = useState(false); // NEW
  const [adminPass, setAdminPass] = useState(''); // NEW

  // Admin state
  const [admissions, setAdmissions] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState('tid'); // tid, mobile, date
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    if (isAdmin) {
      fetchAdmissionsStatus();
    }
  }, [isAdmin]);

  const resetForm = () => {
    setFormData({
      fullName: '',
      email: '',
      mobileNumber: '',
      cnic: '',
      course: '',
      amount: '',
      currency: 'PKR',
      source: '',
      idType: '',
    });
    setTid('');
    setReceipt(null);
    setVerificationStatus('idle');
  };

  const fetchAdmissionsStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE}/admin/admissions-status`);
      setAdmissions(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const courses = [
    "Computer Science", "Information Technology", "Business Administration",
    "Software Engineering", "Artificial Intelligence", "Cyber Security",
    "Data Science", "Digital Marketing", "Fashion Design", "Graphic Design"
  ];

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
      if (res.data.claimed) {
        setVerificationStatus('claimed');
      } else if (res.data.verified) {
        setVerificationStatus('verified');
        setFormData({ ...formData, amount: res.data.data.amount, source: res.data.data.payment_source });
      } else {
        setVerificationStatus('idle');
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
      data.append('mobileNumber', formData.mobileNumber);
      data.append('cnic', `${formData.idType}: ${formData.cnic}`);
      data.append('course', formData.course);
      data.append('course_description', formData.courseDescription);
      data.append('transaction_id', tid);
      data.append('amount', formData.amount);
      data.append('currency', formData.currency);
      data.append('payment_source', formData.source);
      data.append('receipt', receipt);

      try {
        await axios.post(`${API_BASE}/admission/international-payment`, data);
        setMessage('Success! Your international payment evidence has been submitted for manual approval.');
        resetForm();
        setTimeout(() => setMessage(''), 5000);
      } catch (err) {
        const errorMsg = err.response?.data?.error || 'Error submitting payment evidence.';
        setMessage(errorMsg);
      }
    } else {
      try {
        const res = await axios.post(`${API_BASE}/admission/submit`, {
          fullName: formData.fullName,
          email: formData.email,
          mobileNumber: formData.mobileNumber,
          cnic: formData.cnic,
          course: formData.course,
          courseDescription: formData.courseDescription, // NEW
          tid,
          source: formData.source,
          amount: formData.amount,
          currency: 'PKR'
        });

        if (res.data.paymentStatus === 'Verified') {
          setMessage('Success! Your admission form has been submitted and your payment was automatically verified. You will receive an email shortly.');
        } else {
          setMessage('Success! Your admission form has been submitted. We are verifying your payment, Once your payment is verified, you will be notified through Email.');
        }
        resetForm();
        setTimeout(() => setMessage(''), 5000);
      } catch (err) {
        const errorMsg = err.response?.data?.error || 'Error submitting admission form.';
        setMessage(errorMsg);
      }
    }
  };

  const approvePayment = async (logId) => {
    try {
      await axios.post(`${API_BASE}/admin/approve`, { id: logId });
      fetchAdmissionsStatus();
    } catch (err) {
      console.error(err);
    }
  };

  const forceMatch = async (row) => {
    try {
      await axios.post(`${API_BASE}/admin/force-match`, {
        transaction_id: row.transaction_id,
        amount: row.amount,
        currency: row.currency,
        source: row.source
      });
      fetchAdmissionsStatus();
    } catch (err) {
      console.error(err);
      alert('Error verifying manually: ' + (err.response?.data?.error || 'Unknown error'));
    }
  };

  const pendingAdmissions = admissions.filter(a => (a.payment_status || '').toLowerCase() !== 'verified');
  
  // Filter Logic
  const filteredVerifiedAdmissions = admissions.filter(a => {
    const isVerified = (a.payment_status || '').toLowerCase() === 'verified';
    if (!isVerified) return false;
    
    const search = searchTerm.toLowerCase();
    if (!search) return true;

    if (searchType === 'tid') {
      return (a.transaction_id || '').toLowerCase().includes(search);
    }
    if (searchType === 'mobile') {
      return (a.mobile_number || '').toLowerCase().includes(search);
    }
    if (searchType === 'date') {
      const d = new Date(a.timestamp);
      // Format to DD/MM/YY
      const dmy = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear().toString().slice(-2)}`;
      return dmy.includes(search);
    }
    return true;
  });

  // Pagination Logic
  const totalVerifiedPages = Math.ceil(filteredVerifiedAdmissions.length / itemsPerPage);
  const paginatedVerifiedAdmissions = filteredVerifiedAdmissions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const exportToExcel = () => {
    if (filteredVerifiedAdmissions.length === 0) return alert('No students to export');

    const data = filteredVerifiedAdmissions.map(a => ({
      'Full Name': a.full_name,
      'Email': a.email,
      'Mobile': a.mobile_number,
      'CNIC': a.cnic,
      'Course': a.course,
      'TID': a.transaction_id,
      'Amount': `${a.amount} ${a.currency}`,
      'Date': new Date(a.timestamp).toLocaleString()
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Verified Students");
    XLSX.writeFile(wb, `Verified_Students_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (isAdmin) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-8">
        <div className="max-w-7xl mx-auto">
          <header className="flex justify-between items-center mb-8 border-b border-slate-700 pb-4">
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <LayoutDashboard className="text-blue-400" /> Admit<span className="text-blue-400">Pay</span> Dashboard
            </h1>
            <button onClick={() => setIsAdmin(false)} className="px-4 py-2 bg-slate-800 rounded hover:bg-slate-700 transition">
              Student View
            </button>
          </header>

          <div className="space-y-12">
            {/* Pending Section */}
            <section>
              <h2 className="text-xl font-bold text-slate-400 mb-4 flex items-center gap-2">
                <Loader2 size={18} className="animate-spin text-yellow-500" /> Pending Applications
              </h2>
              <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900/50 border-b border-slate-700">
                        <th className="p-4 font-semibold text-slate-400 whitespace-nowrap">Student Name</th>
                        <th className="p-4 font-semibold text-slate-400 whitespace-nowrap">Contact</th>
                        <th className="p-4 font-semibold text-slate-400 whitespace-nowrap">Details</th>
                        <th className="p-4 font-semibold text-slate-400 whitespace-nowrap">Course</th>
                        <th className="p-4 font-semibold text-slate-400 whitespace-nowrap">Payment</th>
                        <th className="p-4 font-semibold text-slate-400 whitespace-nowrap">Status</th>
                        <th className="p-4 font-bold text-slate-400 whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingAdmissions.map((row) => (
                        <tr key={row.id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition">
                          <td className="p-4 font-medium">{row.full_name}</td>
                          <td className="p-4 text-xs">
                            <div className="text-slate-200">{row.email}</div>
                            <div className="text-slate-400">{row.mobile_number}</div>
                          </td>
                          <td className="p-4 text-sm text-slate-300">
                            <div>CNIC: {row.cnic}</div>
                          </td>
                          <td className="p-4">
                            <div className="text-blue-400 font-bold text-sm">{row.course}</div>
                            {row.course_description && (
                              <div className="text-[10px] text-slate-500 italic mt-1 bg-slate-900/50 p-1 px-2 rounded border border-slate-700/50 w-fit">
                                {row.course_description}
                              </div>
                            )}
                          </td>
                          <td className="p-4">
                            <div className="font-mono text-xs">{row.transaction_id}</div>
                            <div className="font-bold text-sm text-indigo-400">{row.amount} {row.currency}</div>
                          </td>
                          <td className="p-4">
                            {(row.payment_status || '').toLowerCase() === 'pending' ? (
                              <span className="flex items-center gap-1 text-yellow-500 font-semibold px-2 py-1 bg-yellow-500/10 rounded-full w-fit text-[10px] uppercase tracking-wider border border-yellow-500/20">
                                <AlertCircle size={10} /> Pending Approval
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-slate-500 font-semibold px-2 py-1 bg-slate-500/10 rounded-full w-fit text-[10px] uppercase tracking-wider border border-slate-500/20">
                                <Loader2 size={10} className="animate-spin" /> Matching...
                              </span>
                            )}
                          </td>
                          <td className="p-4">
                            <div className="flex flex-wrap gap-2">
                              {row.payment_status === 'Pending' && (
                                <button onClick={() => approvePayment(row.log_id)} className="text-[10px] bg-blue-600 hover:bg-blue-500 font-bold uppercase tracking-wider px-3 py-1.5 rounded-full shadow-lg shadow-blue-500/20 active:scale-95 transition-all">
                                  Approve
                                </button>
                              )}
                              {!row.payment_status && (
                                <button onClick={() => forceMatch(row)} className="text-[10px] bg-indigo-600 hover:bg-indigo-500 font-bold uppercase tracking-wider px-3 py-1.5 rounded-full shadow-lg shadow-indigo-500/20 active:scale-95 transition-all">
                                  Verify
                                </button>
                              )}
                                {row.receipt_image_url && (
                                  <a 
                                    href={`${API_BASE}${row.receipt_image_url}`} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-[10px] bg-slate-700 hover:bg-slate-600 font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border border-slate-600 transition-all flex items-center gap-1"
                                  >
                                    <ImageIcon size={10} /> View Receipt
                                  </a>
                                )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pendingAdmissions.length === 0 && (
                  <p className="p-10 text-center text-slate-500 italic text-sm">No pending applications at the moment.</p>
                )}
              </div>
            </section>

            {/* Verified Section */}
            <section>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-green-500 flex items-center gap-2">
                  <CheckCircle size={18} /> Verified Students
                </h2>
                <div className="flex items-center gap-4">
                  <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg overflow-hidden focus-within:border-blue-500 transition-all">
                    <select 
                      className="bg-slate-900 text-slate-400 text-xs font-bold border-r border-slate-700 px-3 py-2 outline-none cursor-pointer hover:bg-slate-850"
                      value={searchType}
                      onChange={(e) => {
                        setSearchType(e.target.value);
                        setSearchTerm('');
                        setCurrentPage(1);
                      }}
                    >
                      <option value="tid">By TID</option>
                      <option value="mobile">By Mobile</option>
                      <option value="date">By Date</option>
                    </select>
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                      <input 
                        type="text" 
                        placeholder={
                          searchType === 'date' ? "e.g. 16/3/26" : 
                          searchType === 'mobile' ? "Search Mobile..." : "Search TID..."
                        }
                        className="bg-transparent pl-10 pr-4 py-2 text-sm outline-none w-48"
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setCurrentPage(1);
                        }}
                      />
                    </div>
                  </div>
                  {filteredVerifiedAdmissions.length > 0 && (
                    <button
                      onClick={exportToExcel}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-green-900/20 active:scale-95"
                    >
                      <FileDown size={18} /> Export
                    </button>
                  )}
                </div>
              </div>
              <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900/50 border-b border-slate-700">
                        <th className="p-4 font-semibold text-slate-400 whitespace-nowrap">Student Name</th>
                        <th className="p-4 font-semibold text-slate-400 whitespace-nowrap">Contact</th>
                        <th className="p-4 font-semibold text-slate-400 whitespace-nowrap">Details</th>
                        <th className="p-4 font-semibold text-slate-400 whitespace-nowrap">TID</th>
                        <th className="p-4 font-semibold text-slate-400 whitespace-nowrap">Course</th>
                        <th className="p-4 font-semibold text-slate-400 whitespace-nowrap">Status</th>
                        <th className="p-4 font-semibold text-slate-400 whitespace-nowrap">Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedVerifiedAdmissions.map((row) => (
                        <tr key={row.id} className="border-b border-slate-700/50 bg-green-500/5 hover:bg-green-500/10 transition">
                          <td className="p-4 font-bold text-slate-100">{row.full_name}</td>
                          <td className="p-4 text-xs">
                            <div className="text-slate-300">{row.email}</div>
                            <div className="text-slate-400">{row.mobile_number}</div>
                          </td>
                          <td className="p-4 text-sm text-slate-400">
                            <div>CNIC: {row.cnic}</div>
                          </td>
                          <td className="p-4 font-mono text-sm text-slate-300">{row.transaction_id}</td>
                          <td className="p-4">
                            <div className="font-bold text-blue-400 text-sm">{row.course}</div>
                            {row.course_description && (
                              <div className="text-[10px] text-slate-500 italic mt-1 bg-slate-900/50 p-1 px-2 rounded border border-slate-700/50 w-fit">
                                {row.course_description}
                              </div>
                            )}
                          </td>
                          <td className="p-4">
                            <span className="flex items-center gap-1 text-green-400 font-bold px-3 py-1 bg-green-500/20 rounded-full w-fit text-[10px] uppercase tracking-wider border border-green-500/30">
                              <CheckCircle size={10} /> Verified
                            </span>
                          </td>
                          <td className="p-4">
                            {row.receipt_image_url && (
                              <a 
                                href={`${API_BASE}${row.receipt_image_url}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-[10px] bg-slate-700 hover:bg-slate-600 font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border border-slate-600 transition-all flex items-center gap-1 inline-flex"
                              >
                                <ImageIcon size={10} /> View Receipt
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredVerifiedAdmissions.length === 0 && (
                  <p className="p-10 text-center text-slate-500 italic text-sm">No verified students found.</p>
                )}

                {/* Pagination Controls */}
                {totalVerifiedPages > 1 && (
                  <div className="p-4 bg-slate-900/50 border-t border-slate-700 flex justify-between items-center text-sm">
                    <p className="text-slate-500">
                      Showing <span className="text-slate-300">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-slate-300">{Math.min(currentPage * itemsPerPage, filteredVerifiedAdmissions.length)}</span> of <span className="text-slate-300">{filteredVerifiedAdmissions.length}</span> students
                    </p>
                    <div className="flex gap-2">
                      <button 
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(prev => prev - 1)}
                        className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <div className="flex items-center px-4 font-bold text-blue-400 bg-slate-800 rounded-lg">
                        Page {currentPage} of {totalVerifiedPages}
                      </div>
                      <button 
                        disabled={currentPage === totalVerifiedPages}
                        onClick={() => setCurrentPage(prev => prev + 1)}
                        className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 flex items-center justify-center p-4 font-sans selection:bg-blue-500/30">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="w-full max-w-3xl bg-slate-900/40 backdrop-blur-xl rounded-3xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] border border-slate-700/50 overflow-hidden relative z-10 transition-all duration-500 hover:shadow-blue-500/10">
        <div className="bg-gradient-to-br from-blue-600/20 via-indigo-600/10 to-transparent p-10 text-center relative border-b border-slate-700/30">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent"></div>
          <GraduationCap className="mx-auto mb-6 text-blue-400 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]" size={70} />
          <h2 className="text-4xl font-black mb-3 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-100 to-slate-400">
            Admit<span className="text-blue-400">Pay</span> Admission
          </h2>
          <p className="text-lg text-slate-400 font-medium tracking-wide">Global Education Portal 2026</p>
          <button
            onClick={() => {
              const pass = prompt('Enter Admin Password:');
              if (pass === 'admin786') {
                setIsAdmin(true);
              } else {
                alert('Invalid Password');
              }
            }}
            className="absolute top-6 right-6 text-[10px] font-bold tracking-widest uppercase bg-slate-800/50 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-full transition-all duration-300 text-slate-500 hover:text-blue-400"
          >
            Admin Portal
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-8">
          <div className="flex items-center justify-between p-6 bg-slate-950/40 rounded-2xl border border-slate-800/50 group transition-all duration-300 hover:border-blue-500/30">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl transition-colors duration-500 ${isInternational ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>
                <Globe size={24} />
              </div>
              <div>
                <p className="font-bold text-lg text-slate-100">{isInternational ? 'International Admission' : 'Domestic Admission'}</p>
                <p className="text-xs text-slate-500 font-medium">{isInternational ? 'Wise • WU • Remitly • Payoneer' : 'EasyPaisa • JazzCash • Bank Transfer'}</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer scale-110">
              <input type="checkbox" checked={isInternational} onChange={(e) => {
                setIsInternational(e.target.checked);
                resetForm();
              }} className="sr-only peer" />
              <div className="w-14 h-7 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="group space-y-3">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 group-focus-within:text-blue-400 transition-colors">
                <User size={14} /> Full Name
              </label>
              <input type="text" required placeholder="e.g. John Doe" className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all placeholder:text-slate-700" value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} />
            </div>
            <div className="group space-y-3">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 group-focus-within:text-blue-400 transition-colors">
                <AlertCircle size={14} /> Email Address
              </label>
              <input type="email" required placeholder="john@example.com" className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all placeholder:text-slate-700" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
            </div>
            <div className="group space-y-3">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 group-focus-within:text-blue-400 transition-colors">
                <User size={14} /> Mobile Number
              </label>
              <input type="tel" required placeholder="e.g. 03001234567" className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all placeholder:text-slate-700" value={formData.mobileNumber} onChange={(e) => setFormData({ ...formData, mobileNumber: e.target.value })} />
            </div>
            <div className="group space-y-3">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 group-focus-within:text-blue-400 transition-colors">
                <User size={14} /> {isInternational ? 'Identity Document' : 'CNIC Number'}
              </label>
              {!isInternational ? (
                <input 
                  type="text" 
                  required 
                  placeholder="e.g. 42101-1234567-1" 
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all placeholder:text-slate-700" 
                  value={formData.cnic} 
                  onChange={(e) => setFormData({ ...formData, cnic: e.target.value })} 
                />
              ) : (
                <div className="flex flex-col gap-3">
                  <select 
                    required 
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer text-slate-300" 
                    value={formData.idType} 
                    onChange={(e) => setFormData({ ...formData, idType: e.target.value })}
                  >
                    <option value="" className="text-slate-700">Select ID Type</option>
                    <option value="Aadhaar Card or Voter ID">Aadhaar Card or Voter ID</option>
                    <option value="Driver’s License or State ID">Driver’s License or State ID</option>
                    <option value="National ID Card">National ID Card</option>
                  </select>
                  <input 
                  type="text" 
                  required 
                  placeholder="Enter ID / Card Number" 
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all placeholder:text-slate-700" 
                  value={formData.cnic} 
                  onChange={(e) => setFormData({ ...formData, cnic: e.target.value })} 
                />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="group space-y-3 relative">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 group-focus-within:text-blue-400 transition-colors">
                  <GraduationCap size={14} /> Admission Applied In
                </label>

                {/* Custom Beautiful Dropdown */}
                <div
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 cursor-pointer flex justify-between items-center hover:border-blue-500/30 transition-all text-slate-300"
                  onClick={() => setShowCourseOptions(!showCourseOptions)}
                >
                  <span className={formData.course ? 'text-blue-400 font-bold' : 'text-slate-700'}>
                    {formData.course || 'Select Course'}
                  </span>
                  <div className={`transition-transform duration-300 ${showCourseOptions ? 'rotate-180' : ''}`}>
                    <AlertCircle size={14} className="text-slate-600" />
                  </div>
                </div>

                {showCourseOptions && (
                  <div className="absolute top-full left-0 w-full mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto overflow-x-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    {courses.map(c => (
                      <div
                        key={c}
                        className="p-4 hover:bg-blue-600/20 hover:text-blue-400 cursor-pointer transition-colors border-b border-slate-800/50 last:border-0 text-sm font-medium"
                        onClick={() => {
                          setFormData({ ...formData, course: c });
                          setShowCourseOptions(false);
                        }}
                      >
                        {c}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {formData.course && (
                <div className="group space-y-3 animate-in fade-in slide-in-from-right-4 duration-500">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                     Additional Class Info (e.g. {formData.course === 'Artificial Intelligence' ? 'Evening Class 11 Pm' : 'Timing/Batch'})
                  </label>
                  <textarea
                    placeholder="e.g. Evening Class 11 Pm..."
                    className="w-full h-[58px] bg-slate-950/50 border border-slate-800 rounded-xl p-4 outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all placeholder:text-slate-700 text-sm resize-none"
                    value={formData.courseDescription}
                    onChange={(e) => setFormData({ ...formData, courseDescription: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="group space-y-3">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Payment Source</label>
                {!isInternational ? (
                  <select required className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer" value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })}>
                    <option value="">Select Platform / Bank</option>
                    <option value="EasyPaisa">EasyPaisa</option>
                    <option value="JazzCash">JazzCash</option>
                    <option value="SadaPay">SadaPay</option>
                    <option value="NayaPay">NayaPay</option>
                    <optgroup label="Pakistani Banks">
                      {pakBanks.map(bank => <option key={bank} value={bank}>{bank}</option>)}
                    </optgroup>
                  </select>
                ) : (
                  <select required className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 outline-none focus:border-blue-500/50 appearance-none cursor-pointer" value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })}>
                    <option value="">Select Gateway</option>
                    <option value="Wise">Wise</option>
                    <option value="Remitly">Remitly</option>
                    <option value="Western Union">Western Union</option>
                    <option value="Payoneer">Payoneer</option>
                  </select>
                )}
              </div>
              <div className="group space-y-3">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Fee Paid</label>
                <div className="flex gap-3">
                  <input type="number" required placeholder="5000" className="flex-1 bg-slate-950/50 border border-slate-800 rounded-xl p-4 outline-none focus:border-blue-500/50 transition-all" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} />
                  {isInternational ? (
                    <select className="bg-slate-900 border border-slate-800 rounded-xl px-4 font-bold text-blue-400" value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })}>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                  ) : (
                    <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 flex items-center justify-center font-bold text-slate-500">PKR</div>
                  )}
                </div>
              </div>
            </div>

            <div className="group space-y-3">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 group-focus-within:text-blue-400">
                <DollarSign size={14} /> {isInternational ? 'Ref Code / MTCN' : 'Transaction ID (TID)'}
              </label>
              <div className="relative">
                <input type="text" required placeholder={isInternational ? "Enter Alpha-Numeric Reference" : "Enter 11-Digit Transaction ID"} className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 pr-14 outline-none focus:border-blue-500/50 transition-all font-mono tracking-wider" value={tid} onChange={handleTidChange} />
                <div className="absolute right-4 top-4">
                  {verificationStatus === 'loading' && <Loader2 className="animate-spin text-blue-500" size={24} />}
                  {verificationStatus === 'verified' && <div className="p-1 bg-green-500/20 rounded-full animate-in zoom-in"><CheckCircle className="text-green-500" size={20} /></div>}
                  {verificationStatus === 'claimed' && <div className="p-1 bg-yellow-500/20 rounded-full animate-in zoom-in"><AlertCircle className="text-yellow-500" size={20} /></div>}
                  {verificationStatus === 'error' && <AlertCircle className="text-red-500" size={20} />}
                </div>
              </div>
              {verificationStatus === 'verified' && (
                <div className="flex items-center gap-2 text-[11px] text-green-400 bg-green-500/5 p-3 rounded-lg border border-green-500/20 animate-in fade-in slide-in-from-top-2">
                  <CheckCircle size={14} />
                  <p className="font-semibold">Automatic verification successful! Source: {formData.source}</p>
                </div>
              )}
              {verificationStatus === 'claimed' && (
                <div className="flex items-center gap-2 text-[11px] text-yellow-500 bg-yellow-500/5 p-3 rounded-lg border border-yellow-500/20 animate-in fade-in slide-in-from-top-2">
                  <AlertCircle size={14} />
                  <p className="font-semibold text-yellow-500">This Transaction ID has already been used for an admission.</p>
                </div>
              )}
            </div>

            {isInternational && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Upload size={14} /> Receipt Evidence
                </label>
                <div className="border-2 border-dashed border-slate-800 rounded-2xl p-10 text-center hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group/upload relative cursor-pointer">
                  <input type="file" required={isInternational} className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => setReceipt(e.target.files[0])} />
                  <div className="space-y-3">
                    <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center mx-auto group-hover/upload:scale-110 transition-transform">
                      <Upload className="text-slate-500 group-hover/upload:text-blue-400" size={24} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-slate-300">{receipt ? receipt.name : 'Upload Payment Screenshot'}</p>
                      <p className="text-xs text-slate-500">Max size 5MB • JPG, PNG or PDF</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {message && (
            <div className={`p-5 rounded-2xl flex items-center gap-4 animate-in slide-in-from-bottom-2 duration-300 ${message.includes('Success') ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
              <div className={`p-2 rounded-full ${message.includes('Success') ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                {message.includes('Success') ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
              </div>
              <p className="font-bold text-sm tracking-wide leading-relaxed">{message}</p>
            </div>
          )}

          <button type="submit" className="w-full relative group overflow-hidden py-5 rounded-2xl font-black text-xl tracking-widest uppercase transition-all shadow-[0_0_30px_-5px_transparent] hover:shadow-blue-500/40">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-700 transition-transform group-hover:scale-105 duration-500"></div>
            <span className="relative z-10 text-white flex items-center justify-center gap-3">
              Apply Admission <CheckCircle size={24} />
            </span>
          </button>
        </form>
      </div>
    </div>
  );

}

export default App;
