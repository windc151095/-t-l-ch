/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  format, 
  addDays, 
  startOfWeek, 
  eachDayOfInterval, 
  isSameDay, 
  addMinutes, 
  parse, 
  isPast, 
  isToday,
  startOfDay
} from 'date-fns';
import { vi } from 'date-fns/locale';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  User, 
  Mail, 
  MessageSquare, 
  CheckCircle2,
  Trash2,
  Lock,
  LogOut,
  CalendarDays,
  Plus
} from 'lucide-react';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  serverTimestamp, 
  deleteDoc, 
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  getDoc
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User as FirebaseUser 
} from 'firebase/auth';
import { db, auth, googleProvider } from './lib/firebase';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface DayConfig {
  morningActive: boolean;
  afternoonActive: boolean;
  duration: number;
}

interface Appointment {
  id: string;
  clientName: string;
  guide: string;
  question: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: 'active' | 'cancelled';
  password: string;
  createdAt: any;
}

// --- Constants ---
const SLOT_DURATION = 30; // minutes

export default function App() {
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [lockedSlots, setLockedSlots] = useState<{ id: string; date: string; startTime: string }[]>([]);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isFirebaseAdmin, setIsFirebaseAdmin] = useState(false);
  const [isStaticAdmin, setIsStaticAdmin] = useState(() => localStorage.getItem('isStaticAdmin') === 'true');
  const [view, setView] = useState<'booking' | 'admin'>('booking');
  const [isBooking, setIsBooking] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [formData, setFormData] = useState({ name: '', guide: '', question: '', password: '' });
  const [slotDuration, setSlotDuration] = useState(30);
  const [businessHours, setBusinessHours] = useState([
    { label: 'Sáng', start: 9, end: 12 },
    { label: 'Chiều', start: 14, end: 19 }
  ]);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [currentDayConfig, setCurrentDayConfig] = useState<DayConfig | null>(null);

  const isAdmin = isFirebaseAdmin || isStaticAdmin;

  const updateDayConfig = async (updates: Partial<DayConfig>) => {
    if (!isAdmin) return;
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const configRef = doc(db, 'dayConfigs', dateStr);
    
    // Fallback to global if doesn't exist
    const baseConfig = currentDayConfig || {
      morningActive: true,
      afternoonActive: true,
      duration: slotDuration
    };

    const newConfig = { ...baseConfig, ...updates, date: dateStr };
    try {
      await setDoc(configRef, newConfig, { merge: true });
    } catch (err) {
      console.error("Day config error:", err);
    }
  };

  const updateSettings = async (updates: any) => {
    setIsUpdatingSettings(true);
    try {
      const settingsRef = doc(db, 'settings', 'global');
      await setDoc(settingsRef, updates, { merge: true });
    } catch (err) {
      console.error("Settings error:", err);
    } finally {
      setIsUpdatingSettings(false);
    }
  };
  
  // States for Manage Booking
  const [manageAppointment, setManageAppointment] = useState<Appointment | null>(null);
  const [managePassword, setManagePassword] = useState('');
  const [isManaging, setIsManaging] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);

  // Simple Admin Login State
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [adminLogin, setAdminLogin] = useState({ user: '', pass: '' });

  // Auth & Admin check
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const adminDoc = await getDoc(doc(db, 'admins', u.uid));
          setIsFirebaseAdmin(adminDoc.exists());
        } catch (err) {
          console.error("Admin check error:", err);
          setIsFirebaseAdmin(false);
        }
      } else {
        setIsFirebaseAdmin(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSimpleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminLogin.user === 'admin' && adminLogin.pass === '123456') {
      setIsStaticAdmin(true);
      localStorage.setItem('isStaticAdmin', 'true');
      setShowLoginModal(false);
      setAdminLogin({ user: '', pass: '' });
      setView('admin');
    } else {
      alert("Sai tài khoản hoặc mật khẩu!");
    }
  };

  const handleSimpleLogout = () => {
    setIsStaticAdmin(false);
    localStorage.removeItem('isStaticAdmin');
    setView('booking');
  };

  // Fetch Settings
  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setSlotDuration(data.slotDuration || 30);
        if (data.businessHours && Array.isArray(data.businessHours)) {
          setBusinessHours(data.businessHours);
        } else if (data.businessHours && !Array.isArray(data.businessHours)) {
          // Migration from old single range to new array format
          setBusinessHours([
            { label: 'Sáng', start: data.businessHours.start || 9, end: 12 },
            { label: 'Chiều', start: 14, end: data.businessHours.end || 19 }
          ]);
        }
      }
    });
    return () => unsubSettings();
  }, []);

  // Fetch appointments and locked slots for selected date
  useEffect(() => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    
    // Fetch Appointments
    const qApps = query(collection(db, 'appointments'), where('date', '==', dateStr));
    const unsubApps = onSnapshot(qApps, (snapshot) => {
      const apps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
      setAppointments(apps.filter(app => (app as any).status !== 'cancelled'));
    });

    // Fetch Locked Slots
    const qLocked = query(collection(db, 'lockedSlots'), where('date', '==', dateStr));
    const unsubLocked = onSnapshot(qLocked, (snapshot) => {
      const locked = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setLockedSlots(locked);
    });

    // Fetch Day Config
    const unsubDayConfig = onSnapshot(doc(db, 'dayConfigs', dateStr), (snapshot) => {
      if (snapshot.exists()) {
        setCurrentDayConfig(snapshot.data() as DayConfig);
      } else {
        setCurrentDayConfig(null);
      }
    });

    return () => {
      unsubApps();
      unsubLocked();
      unsubDayConfig();
    };
  }, [selectedDate]);

  const generateSlots = () => {
    const slots: string[] = [];
    const activeDuration = currentDayConfig?.duration || slotDuration;
    
    businessHours.forEach(range => {
      // Check if this session is enabled for the current day
      if (currentDayConfig) {
        if (range.label === 'Sáng' && !currentDayConfig.morningActive) return;
        if (range.label === 'Chiều' && !currentDayConfig.afternoonActive) return;
      }

      let current = parse(`${range.start}:00`, 'H:mm', new Date());
      const end = parse(`${range.end}:00`, 'H:mm', new Date());

      while (current < end) {
        slots.push(format(current, 'HH:mm'));
        current = addMinutes(current, activeDuration);
      }
    });
    return slots;
  };

  const slots = generateSlots();

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) return;

    setIsBooking(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const activeDuration = currentDayConfig?.duration || slotDuration;
      const endTime = format(addMinutes(parse(selectedSlot, 'HH:mm', new Date()), activeDuration), 'HH:mm');
      
      await addDoc(collection(db, 'appointments'), {
        clientName: formData.name,
        guide: formData.guide,
        question: formData.question,
        date: dateStr,
        startTime: selectedSlot,
        endTime: endTime,
        password: formData.password,
        status: 'active',
        createdAt: serverTimestamp()
      });

      setBookingSuccess(true);
      setFormData({ name: '', guide: '', question: '', password: '' });
      setSelectedSlot(null);
      setTimeout(() => setBookingSuccess(false), 5000);
    } catch (err) {
      console.error("Booking error:", err);
      alert("Đã có lỗi xảy ra. Mã PIN cần từ 4-20 ký tự.");
    } finally {
      setIsBooking(false);
    }
  };

  const handleCancelAppointment = async () => {
    if (!manageAppointment) return;
    setIsManaging(true);
    try {
      if (isAdmin) {
        await deleteDoc(doc(db, 'appointments', manageAppointment.id));
      } else {
        if (managePassword !== (manageAppointment as any).password) {
          alert("Sai Mã PIN!");
          return;
        }

        await updateDoc(doc(db, 'appointments', manageAppointment.id), {
          status: 'cancelled',
          password: managePassword 
        });
      }
      setShowManageModal(false);
      setManageAppointment(null);
      setManagePassword('');
    } catch (err) {
      console.error("Cancel error:", err);
      alert("Bạn không có quyền thực hiện hành động này.");
    } finally {
      setIsManaging(false);
    }
  };

  const toggleLockSlot = async (slot: string) => {
    if (!isAdmin) return;
    const existingLock = lockedSlots.find(l => l.startTime === slot);
    try {
      if (existingLock) {
        await deleteDoc(doc(db, 'lockedSlots', existingLock.id));
      } else {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        await addDoc(collection(db, 'lockedSlots'), {
          date: dateStr,
          startTime: slot,
          password: '123456'
        });
      }
    } catch (err) {
      console.error("Lock error:", err);
    }
  };

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login error:", err);
    }
  };

  const logout = async () => {
    await signOut(auth);
    setView('booking');
  };

  return (
    <div className="min-h-screen bg-yellow-50 text-slate-800 font-sans selection:bg-yellow-200">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white border-b border-yellow-200 px-8 py-4 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-yellow-400 rounded-md flex items-center justify-center text-amber-950 shadow-sm font-black">
            <CalendarIcon size={18} />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-slate-900">Quản Lý Lịch Hẹn</h1>
            <p className="text-[10px] uppercase tracking-widest text-yellow-600 font-bold -mt-1">Energy Booking</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <button 
              onClick={() => setView(view === 'booking' ? 'admin' : 'booking')}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200 shadow-sm border",
                view === 'admin' 
                  ? "bg-yellow-400 text-amber-950 border-yellow-400" 
                  : "bg-white text-slate-600 border-slate-200 hover:border-yellow-400"
              )}
            >
              {view === 'booking' ? 'Chế độ Admin' : 'Quay lại'}
            </button>
          )}

          <button 
            onClick={() => {
              setSelectedSlot(null);
              const el = document.getElementById('selection-panel');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-400 text-amber-950 rounded-xl text-sm font-bold hover:bg-yellow-300 shadow-lg shadow-yellow-200 transition-all active:scale-95"
          >
            <Plus size={16} />
            Đặt Lịch
          </button>
          
          {(user || isStaticAdmin) && (
            <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
              {user && (
                <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-yellow-400 shadow-sm" referrerPolicy="no-referrer" />
              )}
              {isStaticAdmin && !user && (
                <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-700 border border-yellow-200">
                  <User size={14} />
                </div>
              )}
              <button 
                onClick={user ? logout : handleSimpleLogout} 
                className="p-2 text-slate-400 hover:text-yellow-600 transition-colors"
                title="Đăng xuất"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </nav>

      <main className="max-w-[1600px] mx-auto min-h-[calc(100vh-73px)] p-6 lg:p-8">
        <AnimatePresence mode="wait">
          {view === 'booking' ? (
            <motion.div 
              key="booking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              {/* Dashboard Overview - TOP */}
              <section className="bg-white rounded-[40px] p-8 lg:p-12 border border-yellow-200 shadow-xl shadow-yellow-100/50">
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
                  <div>
                    <h3 className="text-xs font-bold text-yellow-600 uppercase tracking-[0.2em] mb-2">Tổng quan lịch hẹn</h3>
                    <h4 className="text-4xl lg:text-5xl font-serif font-black text-slate-900 tracking-tight">
                      {format(selectedDate, 'eeee, dd/MM', { locale: vi })}
                    </h4>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-left px-6 py-3 bg-yellow-400/10 rounded-2xl border border-yellow-200">
                      <p className="text-sm font-black text-amber-950 leading-tight">{appointments.length} phiên</p>
                      <p className="text-[10px] text-yellow-700 uppercase font-bold tracking-widest">Đã đặt chỗ</p>
                    </div>
                    <div className="text-left px-6 py-3 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-sm font-black text-slate-900 leading-tight">{slots.length - appointments.length - lockedSlots.length} slot</p>
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Còn trống</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {appointments.length === 0 ? (
                    <div className="col-span-full py-12 border-2 border-dashed border-yellow-100 rounded-3xl flex flex-col items-center justify-center text-center">
                       <div className="w-12 h-12 rounded-full bg-yellow-50 flex items-center justify-center text-yellow-300 mb-4 animate-pulse">
                         <CalendarDays size={24} />
                       </div>
                       <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Hiện chưa có ai đặt lịch</p>
                    </div>
                  ) : (
                    appointments.sort((a,b) => a.startTime.localeCompare(b.startTime)).map((app) => (
                      <div key={app.id} className="bg-slate-50/50 p-4 rounded-2xl border border-white shadow-sm hover:border-yellow-300 hover:bg-yellow-50 transition-all flex items-start gap-4">
                        <div className="px-3 py-2 bg-yellow-400 text-amber-950 rounded-xl font-mono text-sm font-black shadow-lg shadow-yellow-200 shrink-0">
                          {app.startTime}
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Người đặt</p>
                          <h5 className="font-bold text-slate-900 truncate leading-tight">{app.clientName}</h5>
                          <p className="text-[10px] text-yellow-600 font-bold uppercase tracking-wider flex items-center gap-1 mt-1">
                            {app.guide}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <div className="flex flex-col lg:flex-row gap-8">
                {/* Left Column: Selection Panel */}
                <div id="selection-panel" className="w-full lg:w-[450px] bg-white rounded-[40px] p-8 lg:p-10 space-y-12 border border-yellow-200 shadow-xl shadow-yellow-100/50">
                <section className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Hôm nay là</span>
                  <h2 className="text-5xl lg:text-7xl font-serif font-black text-slate-900 leading-none">
                    {format(selectedDate, 'dd')}
                  </h2>
                  <p className="text-xl font-medium text-slate-500 capitalize">
                    {format(selectedDate, 'eeee, MMMM yyyy', { locale: vi })}
                  </p>
                </section>

                <section>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Chọn ngày</h3>
                    <div className="flex gap-1">
                      <button onClick={() => setSelectedDate(addDays(selectedDate, -7))} className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-400">
                        <ChevronLeft size={16} />
                      </button>
                      <button onClick={() => setSelectedDate(addDays(selectedDate, 7))} className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-400">
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d, i) => (
                      <div key={i} className="text-[10px] font-bold text-slate-300 text-center uppercase py-1">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {eachDayOfInterval({
                      start: startOfWeek(selectedDate, { weekStartsOn: 1 }),
                      end: addDays(startOfWeek(selectedDate, { weekStartsOn: 1 }), 13)
                    }).map((day, i) => {
                      const lastHour = businessHours[businessHours.length - 1].end;
                      const isPastDay = (isPast(day) && !isToday(day)) || (isToday(day) && parse(format(new Date(), 'HH:mm'), 'HH:mm', new Date()) > parse(`${lastHour}:00`, 'HH:mm', new Date()));
                      const isSelected = isSameDay(day, selectedDate);
                      return (
                        <button
                          key={i}
                          disabled={isPastDay}
                          onClick={() => {
                            setSelectedDate(day);
                            setSelectedSlot(null);
                          }}
                          className={cn(
                            "h-10 w-full rounded-xl flex items-center justify-center text-sm transition-all duration-200 font-bold",
                            isSelected 
                              ? "bg-yellow-400 text-amber-950 shadow-lg shadow-yellow-200 scale-110 z-10" 
                              : "text-slate-600 hover:bg-yellow-50 hover:text-yellow-700",
                            isPastDay && "opacity-20 cursor-not-allowed"
                          )}
                        >
                          {format(day, 'd')}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="space-y-8">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Chọn giờ hẹn</h3>
                  
                  {businessHours.map((range, idx) => {
                    const rangeSlots = slots.filter(s => {
                      const hour = parseInt(s.split(':')[0]);
                      return hour >= range.start && hour < range.end;
                    });

                    if (rangeSlots.length === 0) return null;

                    return (
                      <div key={idx} className="space-y-4">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest leading-none">Buổi {range.label}</span>
                          <div className="h-px flex-1 bg-yellow-100" />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {rangeSlots.map((slot) => {
                            const appointment = appointments.find(app => app.startTime === slot);
                            const isLocked = lockedSlots.find(l => l.startTime === slot);
                            const isSelected = selectedSlot === slot;
                            const isSlotPast = isToday(selectedDate) && parse(format(new Date(), 'HH:mm'), 'HH:mm', new Date()) > parse(slot, 'HH:mm', new Date());
                            
                            return (
                              <div key={slot} className="relative group">
                                <button
                                  disabled={(!!isLocked || isSlotPast) && !appointment}
                                  onClick={() => {
                                    if (appointment) {
                                      setManageAppointment(appointment);
                                      setShowManageModal(true);
                                    } else {
                                      setSelectedSlot(slot);
                                    }
                                  }}
                                  className={cn(
                                    "w-full px-2 py-3 rounded-xl border text-[13px] font-black font-mono transition-all duration-200 text-center relative",
                                    (isLocked || isSlotPast) && !appointment
                                      ? "bg-slate-50 border-slate-100 text-slate-200 cursor-not-allowed" 
                                      : appointment
                                        ? "bg-yellow-50 border-yellow-100 text-yellow-200 opacity-50"
                                        : isSelected
                                          ? "bg-white border-yellow-400 ring-2 ring-yellow-400 shadow-xl shadow-yellow-100"
                                          : "bg-white border-slate-200 text-slate-600 hover:border-yellow-400 hover:bg-yellow-50"
                                  )}
                                >
                                  {slot}
                                  {appointment && <span className="absolute -top-1 -right-1 flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
                                  {isLocked && !appointment && (
                                    <span className="block text-[8px] font-bold text-slate-400 uppercase mt-1">Locked</span>
                                  )}
                                </button>
                                
                                {isAdmin && !appointment && (
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleLockSlot(slot);
                                    }}
                                    className="absolute -top-2 -left-2 opacity-0 group-hover:opacity-100 p-1.5 bg-yellow-400 text-amber-950 rounded-full shadow-lg transition-all hover:scale-110 z-10"
                                    title={isLocked ? "Mở khóa" : "Khóa slot này"}
                                  >
                                     {isLocked ? <ChevronRight size={10} className="rotate-90" /> : <Lock size={10} />}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </section>
              </div>

                {/* Right Column: Form Panel */}
                <div className="flex-1 space-y-16">
                  <AnimatePresence mode="wait">
                    {selectedSlot ? (
                      <motion.section
                        key="form"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="space-y-8"
                      >
                         <div className="flex items-center gap-4">
                           <div className="h-px flex-1 bg-yellow-200" />
                           <h3 className="text-xs font-bold text-yellow-600 uppercase tracking-[0.2em] whitespace-nowrap">Đang đặt chỗ cho lúc {selectedSlot}</h3>
                           <div className="h-px flex-1 bg-yellow-200" />
                         </div>

                         <div className="bg-white rounded-[40px] p-10 lg:p-14 border border-yellow-200 shadow-2xl shadow-yellow-100/50">
                           <form onSubmit={handleBooking} className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                             <div className="space-y-2">
                               <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Tên của bạn</label>
                               <input 
                                 required
                                 type="text" 
                                 value={formData.name}
                                 onChange={e => setFormData({...formData, name: e.target.value})}
                                 placeholder="Nhập tên..."
                                 className="w-full px-6 py-4 bg-yellow-50/30 border border-transparent rounded-2xl focus:ring-2 focus:ring-yellow-400 focus:bg-white transition-all outline-none text-base font-bold placeholder:text-slate-300"
                               />
                             </div>

                             <div className="space-y-2">
                               <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Hướng dẫn viên</label>
                               <input 
                                 required
                                 type="text" 
                                 value={formData.guide}
                                 onChange={e => setFormData({...formData, guide: e.target.value})}
                                 placeholder="Ví dụ: Sư Huynh"
                                 className="w-full px-6 py-4 bg-yellow-50/30 border border-transparent rounded-2xl focus:ring-2 focus:ring-yellow-400 focus:bg-white transition-all outline-none text-base font-bold placeholder:text-slate-300"
                               />
                             </div>

                             <div className="md:col-span-2 space-y-2">
                               <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Vấn đề cần hỗ trợ</label>
                               <textarea 
                                 required
                                 rows={4}
                                 value={formData.question}
                                 onChange={e => setFormData({...formData, question: e.target.value})}
                                 placeholder="Bạn muốn trao đổi về điều gì?"
                                 className="w-full px-6 py-4 bg-yellow-50/30 border border-transparent rounded-2xl focus:ring-2 focus:ring-yellow-400 focus:bg-white transition-all outline-none text-base font-bold placeholder:text-slate-300 resize-none"
                               />
                             </div>

                             <div className="md:col-span-2 space-y-2">
                               <div className="flex items-center justify-between ml-1">
                                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Mật khẩu hủy lịch</label>
                                 <span className="text-[9px] text-yellow-600 font-bold uppercase tracking-widest">(Ghi nhớ để tự hủy khi cần)</span>
                               </div>
                               <input 
                                 required
                                 type="text" 
                                 value={formData.password}
                                 onChange={e => setFormData({...formData, password: e.target.value})}
                                 placeholder="Nhập 4 số..."
                                 className="w-full px-6 py-4 bg-yellow-50/30 border border-transparent rounded-2xl focus:ring-2 focus:ring-yellow-400 focus:bg-white transition-all outline-none text-base font-bold tracking-widest placeholder:tracking-normal placeholder:text-slate-300"
                               />
                             </div>

                             <div className="md:col-span-2 pt-6">
                               <button 
                                 disabled={isBooking}
                                 className="w-full py-5 bg-yellow-400 text-amber-950 rounded-2xl text-lg font-black shadow-xl shadow-yellow-200 hover:bg-yellow-300 transition-all transform active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
                               >
                                 {isBooking ? (
                                   <>
                                     <div className="w-5 h-5 border-3 border-amber-950/20 border-t-amber-950 rounded-full animate-spin" />
                                     ĐANG XỬ LÝ...
                                   </>
                                 ) : (
                                   'XÁC NHẬN ĐẶT LỊCH NGAY'
                                 )}
                               </button>
                             </div>
                           </form>
                         </div>
                      </motion.section>
                    ) : (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="py-32 px-8 border-2 border-dashed border-yellow-200 rounded-[40px] flex flex-col items-center justify-center text-center bg-white/40"
                      >
                         <div className="w-20 h-20 rounded-full bg-white shadow-xl flex items-center justify-center text-yellow-300 mb-8 animate-bounce">
                           <Clock size={32} />
                         </div>
                         <h4 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">Sẵn sàng để đặt lịch?</h4>
                         <p className="text-slate-400 font-medium max-w-xs mx-auto">
                           Vui lòng chọn một khung giờ trống ở bên trái để bắt đầu quá trình đặt lịch.
                         </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="admin"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-10"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-200">
                <div className="space-y-6">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900">Quản lý lịch hẹn</h2>
                    <p className="text-slate-500 mt-1 font-medium">{format(selectedDate, 'EEEE, d MMMM yyyy', { locale: vi })}</p>
                  </div>

                    <div className="flex flex-wrap items-center gap-8 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm w-fit">
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Thời lượng mặc định</p>
                        <div className="flex items-center gap-2">
                          {[15, 20, 30].map(val => (
                            <button
                              key={val}
                              onClick={() => updateSettings({ slotDuration: val })}
                              disabled={isUpdatingSettings}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                                slotDuration === val 
                                  ? "bg-yellow-400 text-amber-950" 
                                  : "bg-yellow-50 text-yellow-600 hover:bg-yellow-100"
                              )}
                            >
                              {val}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="h-10 w-px bg-slate-100 hidden md:block" />

                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Khung giờ mặc định</p>
                        <div className="space-y-4">
                          {businessHours.map((range, rbIdx) => (
                            <div key={rbIdx} className="flex items-center gap-3">
                              <span className="text-[10px] text-slate-400 font-bold w-12">{range.label}:</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-300 font-bold uppercase">TỪ</span>
                                <select 
                                  value={range.start}
                                  onChange={(e) => {
                                    const newRanges = [...businessHours];
                                    newRanges[rbIdx].start = parseInt(e.target.value);
                                    updateSettings({ businessHours: newRanges });
                                  }}
                                  className="bg-slate-50 border-0 text-xs font-bold p-1.5 rounded-lg outline-none focus:ring-1 focus:ring-yellow-400"
                                >
                                  {Array.from({length: 24}).map((_, i) => (
                                    <option key={i} value={i}>{i}:00</option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-300 font-bold uppercase">ĐẾN</span>
                                <select 
                                  value={range.end}
                                  onChange={(e) => {
                                    const newRanges = [...businessHours];
                                    newRanges[rbIdx].end = parseInt(e.target.value);
                                    updateSettings({ businessHours: newRanges });
                                  }}
                                  className="bg-slate-50 border-0 text-xs font-bold p-1.5 rounded-lg outline-none focus:ring-1 focus:ring-yellow-400"
                                >
                                  {Array.from({length: 24}).map((_, i) => (
                                    <option key={i} value={i}>{i}:00</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  
                  {/* Day Specific Config - NEW */}
                  <div className="bg-yellow-50 p-6 rounded-3xl border border-yellow-200 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-amber-950 uppercase tracking-widest">Cài đặt cho riêng ngày {format(selectedDate, 'dd/MM')}</h3>
                      {currentDayConfig && (
                        <button 
                          onClick={() => {
                            const dateStr = format(selectedDate, 'yyyy-MM-dd');
                            deleteDoc(doc(db, 'dayConfigs', dateStr));
                          }}
                          className="text-[10px] font-bold text-red-500 uppercase hover:underline"
                        >
                          Xóa tùy chỉnh
                        </button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Phiên làm việc hiện có</p>
                        <div className="flex gap-6">
                          <label className="flex items-center gap-3 cursor-pointer group">
                            <input 
                              type="checkbox" 
                              checked={currentDayConfig?.morningActive ?? true}
                              onChange={(e) => updateDayConfig({ morningActive: e.target.checked })}
                              className="w-5 h-5 rounded-lg border-yellow-300 text-yellow-500 focus:ring-yellow-400 transition-all cursor-pointer"
                            />
                            <span className="text-sm font-black text-slate-600 group-hover:text-amber-950 transition-colors uppercase">Buổi Sáng</span>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer group">
                            <input 
                              type="checkbox" 
                              checked={currentDayConfig?.afternoonActive ?? true}
                              onChange={(e) => updateDayConfig({ afternoonActive: e.target.checked })}
                              className="w-5 h-5 rounded-lg border-yellow-300 text-yellow-500 focus:ring-yellow-400 transition-all cursor-pointer"
                            />
                            <span className="text-sm font-black text-slate-600 group-hover:text-amber-950 transition-colors uppercase">Buổi Chiều</span>
                          </label>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Thời lượng phiên riêng ngày này (phút)</p>
                        <div className="flex gap-2">
                          {[15, 20, 30].map(val => (
                            <button
                              key={val}
                              onClick={() => updateDayConfig({ duration: val })}
                              className={cn(
                                "px-4 py-2 rounded-xl text-xs font-black transition-all border",
                                (currentDayConfig?.duration ?? slotDuration) === val 
                                  ? "bg-yellow-400 text-amber-950 border-yellow-400 shadow-lg shadow-yellow-200" 
                                  : "bg-white text-slate-400 border-slate-100 hover:border-yellow-200 hover:bg-yellow-50"
                              )}
                            >
                              {val}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 bg-white p-1 rounded-md border border-slate-200 shadow-sm">
                  <button 
                    onClick={() => setSelectedDate(addDays(selectedDate, -1))}
                    className="p-2 hover:bg-slate-50 rounded text-slate-400 transition-colors"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="px-4 font-bold text-xs text-slate-700 min-w-[100px] text-center uppercase tracking-widest">
                    {format(selectedDate, 'dd/MM/yyyy')}
                  </div>
                  <button 
                    onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                    className="p-2 hover:bg-slate-50 rounded text-slate-400 transition-colors"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {appointments.length === 0 ? (
                  <div className="bg-white rounded-xl p-24 border border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
                    <CalendarDays size={48} className="text-slate-200 mb-4" />
                    <h3 className="text-lg font-semibold text-slate-900">Không có bản đặt lịch nào</h3>
                    <p className="text-slate-400 text-sm mt-1">Sử dụng giao diện đặt lịch bên ngoài để tạo cuộc hẹn.</p>
                  </div>
                ) : (
                  [...appointments].sort((a, b) => a.startTime.localeCompare(b.startTime)).map((app) => (
                    <div key={app.id} className="bg-white p-4 rounded-xl border border-yellow-100 flex items-center justify-between group hover:border-yellow-300 transition-all shadow-sm border-l-4 border-l-yellow-400">
                      <div className="flex items-center gap-6">
                        <div className="w-14 text-center shrink-0">
                          <span className="text-[11px] font-bold uppercase text-slate-400 block tracking-wider">GIỜ</span>
                          <span className="text-lg font-bold text-slate-900 leading-none">{app.startTime}</span>
                        </div>
                        <div className="h-8 w-px bg-slate-100" />
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-0.5">Người đặt lịch</p>
                          <h4 className="font-semibold text-slate-900">{app.clientName}</h4>
                          <div className="flex flex-col gap-1 mt-1.5 text-slate-400">
                            <span className="text-[11px] font-medium flex items-center gap-1">
                              <User size={12} />
                              GV: {app.guide}
                            </span>
                            <span className="text-[11px] font-medium italic line-clamp-1">
                              Q: {app.question}
                            </span>
                            <span className="text-[11px] font-medium flex items-center gap-1">
                              <Lock size={12} />
                              PIN: {(app as any).password}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => {
                          setManageAppointment(app);
                          setShowManageModal(true);
                        }}
                        className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        title="Quản lý lịch hẹn"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Manage Appointment Modal */}
      <AnimatePresence>
        {showManageModal && manageAppointment && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-yellow-950/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="bg-white rounded-[32px] p-8 max-w-sm w-full shadow-2xl border border-yellow-200"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900">Quản lý lịch hẹn</h2>
                <button onClick={() => { setShowManageModal(false); setManagePassword(''); }} className="text-slate-400 hover:text-slate-600">
                  <ChevronRight size={20} className="rotate-45" />
                </button>
              </div>

              <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-100 space-y-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Chi tiết</p>
                <p className="text-sm font-semibold text-slate-700">{manageAppointment.date} Lúc {manageAppointment.startTime}</p>
                <div className="pt-2 border-t border-slate-200/50 mt-2 space-y-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Người đặt</p>
                  <p className="text-sm text-slate-600">{manageAppointment.clientName}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">Hướng dẫn viên</p>
                  <p className="text-sm text-slate-600">{manageAppointment.guide}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">Câu hỏi</p>
                  <p className="text-sm text-slate-600 italic">"{manageAppointment.question}"</p>
                </div>
              </div>

              <div className="space-y-4">
                {!isAdmin && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                      Nhập Mã PIN để hủy
                    </label>
                    <input 
                      type="password" 
                      value={managePassword}
                      onChange={e => setManagePassword(e.target.value)}
                      placeholder="****"
                      className="w-full px-4 py-2.5 bg-yellow-50 border border-yellow-100 rounded-xl focus:border-yellow-400 focus:bg-white transition-all outline-none text-sm"
                    />
                  </div>
                )}
                
                <button 
                  onClick={handleCancelAppointment}
                  disabled={isManaging || (!isAdmin && !managePassword)}
                  className="w-full py-3.5 bg-red-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-red-200 hover:bg-red-600 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {isManaging ? 'Đang thực hiện...' : isAdmin ? 'Gỡ bỏ lịch hẹn' : 'Hủy lịch hẹn này'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Success Dialog */}
      <AnimatePresence>
        {bookingSuccess && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-yellow-950/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-[40px] p-10 max-w-sm w-full text-center shadow-2xl border border-yellow-200"
            >
              <div className="w-16 h-16 bg-yellow-400 text-amber-950 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-yellow-200">
                <CheckCircle2 size={32} />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Đã đặt lịch thành công</h2>
              <p className="text-slate-500 text-sm leading-relaxed mb-8">
                Lịch hẹn đã được ghi nhận. Hãy nhớ Mã PIN để có thể hủy hẹn khi cần.
              </p>
              <button 
                onClick={() => setBookingSuccess(false)}
                className="w-full py-4 bg-yellow-400 text-amber-950 rounded-2xl font-black text-sm transition-all hover:bg-yellow-300 shadow-lg shadow-yellow-200"
              >
                TUYỆT VỜI
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Login Modal */}
      <AnimatePresence>
        {showLoginModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-yellow-950/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white rounded-[40px] p-10 max-w-sm w-full shadow-2xl overflow-hidden relative border border-yellow-200"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-yellow-400"></div>
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-900">Đăng Nhập Admin</h2>
                <button onClick={() => setShowLoginModal(false)} className="text-slate-300 hover:text-yellow-600 transition-colors">
                  <LogOut size={18} />
                </button>
              </div>

              <form onSubmit={handleSimpleLogin} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Username</label>
                    <input 
                      type="text" 
                      required
                      placeholder="admin"
                      value={adminLogin.user}
                      onChange={(e) => setAdminLogin({...adminLogin, user: e.target.value})}
                      className="w-full p-4 bg-yellow-50/50 border border-transparent rounded-2xl text-sm outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white transition-all font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Mật khẩu</label>
                    <input 
                      type="password" 
                      required
                      placeholder="••••••"
                      value={adminLogin.pass}
                      onChange={(e) => setAdminLogin({...adminLogin, pass: e.target.value})}
                      className="w-full p-4 bg-yellow-50/50 border border-transparent rounded-2xl text-sm outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white transition-all font-bold"
                    />
                  </div>
                </div>

                <div className="p-3 bg-yellow-50 border border-yellow-100 rounded-xl text-[10px] text-yellow-700 font-medium leading-relaxed">
                  Lưu ý: Đây là tài khoản quản trị hệ thống. Hãy bảo mật thông tin này.
                </div>

                <button 
                  type="submit"
                  className="w-full py-4 bg-yellow-400 text-amber-950 rounded-2xl font-black text-xs uppercase tracking-widest transition-all hover:bg-yellow-300 shadow-xl shadow-yellow-200 active:scale-[0.98]"
                >
                  Xác nhận đăng nhập
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="max-w-7xl mx-auto p-12 mt-12 border-t border-yellow-200">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          <p>© 2026 Admin Panel Schedlr</p>
          <div className="flex gap-8">
            <a href="#" className="hover:text-yellow-600 transition-colors">Bảo mật</a>
            <a href="#" className="hover:text-yellow-600 transition-colors">Điều khoản</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
