/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  format, 
  addDays, 
  startOfWeek, 
  eachDayOfInterval, 
  isSameDay, 
  isBefore,
  addMinutes, 
  parse, 
  isPast, 
  isToday,
  startOfDay,
  startOfMonth,
  endOfMonth,
  isSameMonth,
  addMonths,
  getDay,
  getDate
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
  LogIn,
  AlertCircle,
  RotateCcw,
  CalendarDays,
  Plus,
  Settings,
  Edit3,
  Calendar,
  Play,
  Check,
  X,
  FileText,
  Download,
  Search,
  Image as ImageIcon,
  Upload,
  Eye
} from 'lucide-react';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  serverTimestamp, 
  deleteField,
  deleteDoc, 
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  getDoc,
  orderBy,
  limit,
  FirestoreError
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
import { handleFirestoreError } from './services/errorService';

// --- Types ---
interface DayConfig {
  morningActive: boolean;
  afternoonActive: boolean;
  duration: number;
  businessHours?: { label: string; start: number; end: number }[];
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
  cancellationReason?: string;
  cancelledByAdmin?: boolean;
}

interface CV {
  id: string;
  fullName: string;
  phone: string;
  age: string;
  address: string;
  job: string;
  target: string;
  guideName: string;
  guidePhoneLast4: string;
  password: string; // Protecting with PIN
  status: 'pending' | 'approved' | 'rejected';
  phoneLast4: string;
  paymentImageUrl?: string;
  createdAt: any;
  processedAt?: any;
  processedBy?: string;
}

// --- Constants ---
const REVIEWERS = ['Đức Toàn', 'Thành Công', 'Ngọc Ánh'];
const SLOT_DURATION = 30; // minutes

export default function App() {
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [recentCancelled, setRecentCancelled] = useState<Appointment[]>([]);
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
    { label: 'Sáng', start: 8, end: 12 },
    { label: 'Chiều', start: 12, end: 22 }
  ]);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [currentDayConfig, setCurrentDayConfig] = useState<DayConfig | null>(null);
  const [editingDayConfig, setEditingDayConfig] = useState<Partial<DayConfig> | null>(null);
  const [allDayConfigs, setAllDayConfigs] = useState<{ [key: string]: DayConfig }>({});
  const [announcement, setAnnouncement] = useState('');
  const [isAdminMessageVisible, setIsAdminMessageVisible] = useState(true);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()));
  const [activeAdminTab, setActiveAdminTab] = useState<'config' | 'appointments' | 'cancelled' | 'cvs'>('appointments');
  const [cvFilter, setCvFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedPaymentImage, setSelectedPaymentImage] = useState<string | null>(null);
  const [cvs, setCvs] = useState<CV[]>([]);
  const [showCVModal, setShowCVModal] = useState(false);
  const [cvModalTab, setCvModalTab] = useState<'search' | 'create'>('create');
  const [cvSearchPIN, setCvSearchPIN] = useState('');
  const [cvSearchPhoneLast4, setCvSearchPhoneLast4] = useState('');
  const [foundCV, setFoundCV] = useState<CV | null>(null);
  const [isSearchingCV, setIsSearchingCV] = useState(false);
  const [isSubmittingCV, setIsSubmittingCV] = useState(false);
  const [cvFormData, setCvFormData] = useState({
    fullName: '',
    phone: '',
    age: '',
    address: '',
    job: '',
    target: '',
    guideName: '',
    guidePhoneLast4: '',
    password: '',
    paymentImageUrl: ''
  });
  const [cvAutoFillText, setCvAutoFillText] = useState('');
  const [now, setNow] = useState(new Date());
  const [overviewTab, setOverviewTab] = useState<'active' | 'past' | 'empty'>('active');
  const [localReviewers, setLocalReviewers] = useState<Record<string, string>>({});
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [cvActionModal, setCvActionModal] = useState<{ 
    show: boolean; 
    cvId: string; 
    type: 'approve' | 'reject' | 'restore' | null;
  }>({ show: false, cvId: '', type: null });
  const [adminPinInput, setAdminPinInput] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const hasAutoSwitchedRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10000); // update every 10 seconds for smoothness
    return () => clearInterval(timer);
  }, []);

  const isAdmin = isFirebaseAdmin || isStaticAdmin;

  const updateDayConfig = async (updates: Partial<DayConfig>) => {
    if (!isAdmin) return;
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const configRef = doc(db, 'dayConfigs', dateStr);
    
    const baseConfig = editingDayConfig || {
      morningActive: true,
      afternoonActive: true,
      duration: slotDuration,
      businessHours: businessHours
    };

    const newConfig = { ...baseConfig, ...updates, date: dateStr, password: '123456' };
    try {
      await setDoc(configRef, newConfig, { merge: true });
    } catch (err) {
      console.error("Day config error:", err);
      handleFirestoreError(err, 'write', configRef.path);
    }
  };

  const updateSettings = async (updates: any) => {
    setIsUpdatingSettings(true);
    try {
      const settingsRef = doc(db, 'settings', 'global');
      await setDoc(settingsRef, { ...updates, password: '123456' }, { merge: true });
    } catch (err) {
      console.error("Settings error:", err);
      handleFirestoreError(err, 'write', 'settings/global');
    } finally {
      setIsUpdatingSettings(false);
    }
  };
  
  // States for Manage Booking
  const [manageAppointment, setManageAppointment] = useState<Appointment | null>(null);
  const [managePassword, setManagePassword] = useState('');
  const [isManaging, setIsManaging] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [adminReason, setAdminReason] = useState('');
  const [isSuddenCancel, setIsSuddenCancel] = useState(true);

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
          const isHardcodedAdmin = u.email === "congnguyen151095@gmail.com";
          setIsFirebaseAdmin(adminDoc.exists() || isHardcodedAdmin);
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
        setAnnouncement(data.announcement || '');
        if (data.businessHours && Array.isArray(data.businessHours)) {
          setBusinessHours(data.businessHours);
        } else if (data.businessHours && !Array.isArray(data.businessHours)) {
          // Migration from old single range to new array format
          setBusinessHours([
            { label: 'Sáng', start: data.businessHours.start || 8, end: 12 },
            { label: 'Chiều', start: 12, end: data.businessHours.end || 22 }
          ]);
        }
      }
    }, (err) => handleFirestoreError(err, 'get', 'settings/global'));
    return () => unsubSettings();
  }, []);

  // Fetch appointments and locked slots for selected date
  useEffect(() => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    
    // Fetch Appointments
    const qApps = query(collection(db, 'appointments'), where('date', '==', dateStr));
    const unsubApps = onSnapshot(qApps, (snapshot) => {
      const apps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
      // Store all for admin to see cancelled, but filter for view
      setAppointments(apps);
    }, (err) => handleFirestoreError(err, 'list', 'appointments'));

    // Fetch Locked Slots
    const qLocked = query(collection(db, 'lockedSlots'), where('date', '==', dateStr));
    const unsubLocked = onSnapshot(qLocked, (snapshot) => {
      const locked = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setLockedSlots(locked);
    }, (err) => handleFirestoreError(err, 'list', 'lockedSlots'));

    // Fetch Day Config
    const unsubDayConfig = onSnapshot(doc(db, 'dayConfigs', dateStr), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as DayConfig;
        setCurrentDayConfig(data);
        setEditingDayConfig(data);
      } else {
        setCurrentDayConfig(null);
        setEditingDayConfig({
          morningActive: true,
          afternoonActive: true,
          duration: slotDuration,
          businessHours: businessHours
        });
      }
    }, (err) => handleFirestoreError(err, 'get', `dayConfigs/${dateStr}`));

    return () => {
      unsubApps();
      unsubLocked();
      unsubDayConfig();
      setEditingDayConfig(null);
    };
  }, [selectedDate, slotDuration, businessHours]);

  // Fetch all day configs for highlighting (Admin View only)
  useEffect(() => {
    if (!isAdmin) {
      setAllDayConfigs({});
      return;
    }

    const unsubAllConfigs = onSnapshot(collection(db, 'dayConfigs'), (snapshot) => {
      const configs: { [key: string]: DayConfig } = {};
      snapshot.forEach(doc => {
        configs[doc.id] = doc.data() as DayConfig;
      });
      setAllDayConfigs(configs);
    }, (err) => handleFirestoreError(err, 'list', 'dayConfigs'));

    return () => unsubAllConfigs();
  }, [isAdmin]);

  // Fetch 10 most recent global cancellations
  useEffect(() => {
    if (!isAdmin) {
      setRecentCancelled([]);
      return;
    }

    const qRecent = query(
      collection(db, 'appointments'),
      where('status', '==', 'cancelled'),
      orderBy('cancelledAt', 'desc'),
      limit(10)
    );

    const unsubRecent = onSnapshot(qRecent, (snapshot) => {
      const apps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
      setRecentCancelled(apps);
    }, (err) => handleFirestoreError(err, 'list', 'appointments'));

    return () => unsubRecent();
  }, [isAdmin]);

  // Fetch CVs (Admin sees all, User sees none directly)
  useEffect(() => {
    if (!isAdmin) {
      setCvs([]);
      return;
    }

    const qCVs = query(collection(db, 'cvs'), orderBy('createdAt', 'desc'));
    const unsubCVs = onSnapshot(qCVs, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CV));
      setCvs(docs);
    }, (err) => handleFirestoreError(err, 'list', 'cvs'));

    return () => unsubCVs();
  }, [isAdmin]);

  const formatTime = (h: number) => {
    const hh = Math.floor(h);
    const mm = Math.round((h % 1) * 60);
    return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
  };

  const getTimeOptions = (label: string, duration: number) => {
    // Sáng: 08:00 - 12:00, Chiều: 12:00 - 22:00
    const start = label === 'Sáng' ? 8 : 12;
    const end = label === 'Sáng' ? 12 : 22;
    const options = [];
    const step = duration / 60;
    
    // Use a small epsilon to handle floating point precision issues
    for (let i = start; i <= end + 0.001; i += step) {
      if (i <= end + 0.001) {
        options.push(i);
      }
    }
    return options;
  };

  const generateSlots = () => {
    const rawSlots: string[] = [];
    const activeDuration = currentDayConfig?.duration || slotDuration;
    const activeBusinessHours = currentDayConfig?.businessHours || businessHours;
    
    activeBusinessHours.forEach(range => {
      // Check if this session is enabled for the current day
      if (currentDayConfig) {
        if (range.label === 'Sáng' && !currentDayConfig.morningActive) return;
        if (range.label === 'Chiều' && !currentDayConfig.afternoonActive) return;
      }

      let current = parse(formatTime(range.start), 'H:mm', new Date());
      const end = parse(formatTime(range.end), 'H:mm', new Date());

      while (current < end) {
        rawSlots.push(format(current, 'HH:mm'));
        current = addMinutes(current, activeDuration);
      }
    });

    // Ensure unique slots in case of overlapping business hour ranges
    return Array.from(new Set(rawSlots)).sort();
  };

  const slots = generateSlots();

  // Auto-switch to tomorrow if today's schedule is finished
  useEffect(() => {
    if (view !== 'booking' || hasAutoSwitchedRef.current) return;
    
    const today = startOfDay(new Date());
    if (isSameDay(selectedDate, today)) {
      const currentTimeStr = format(now, 'HH:mm');
      
      // 1. Check for upcoming active appointments
      const upcomingApps = appointments.filter(a => 
        a.status === 'active' && 
        (a.endTime || '23:59') > currentTimeStr
      );
      
      // 2. Check for bookable slots
      const takenSlotStartTimes = new Set(appointments.filter(a => a.status !== 'cancelled').map(a => a.startTime));
      const availableSlots = slots.filter(s => {
        const isPastSlot = s <= currentTimeStr;
        return !takenSlotStartTimes.has(s) && !isPastSlot && !lockedSlots.some(l => l.startTime === s);
      });

      // If today is effectively "over" for connections (no upcoming apps and no available slots)
      if (upcomingApps.length === 0 && availableSlots.length === 0) {
        const totalSlotsToday = slots.length;
        if (totalSlotsToday > 0) {
          setSelectedDate(addDays(today, 1));
          hasAutoSwitchedRef.current = true;
        }
      }
    }
  }, [selectedDate, appointments, slots, lockedSlots, now, view]);

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) return;

    setIsBooking(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const activeDuration = currentDayConfig?.duration || slotDuration;
      const endTime = format(addMinutes(parse(selectedSlot, 'HH:mm', new Date()), activeDuration), 'HH:mm');
      
      const appointmentsRef = collection(db, 'appointments');
      await addDoc(appointmentsRef, {
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
      setShowBookingModal(false);
      setTimeout(() => setBookingSuccess(false), 5000);
    } catch (err) {
      console.error("Booking error:", err);
      if (err instanceof Error && err.name === 'FirebaseError' && (err as any).code === 'permission-denied') {
        handleFirestoreError(err, 'create', 'appointments');
      }
      alert("Đã có lỗi xảy ra. Vui lòng kiểm tra lại thông tin. (Mã PIN tối thiểu 4 ký tự)");
    } finally {
      setIsBooking(false);
    }
  };

  const handleRestoreAppointment = async (appId?: string) => {
    const id = appId || manageAppointment?.id;
    if (!id || !isAdmin) return;
    setIsManaging(true);
    try {
      await updateDoc(doc(db, 'appointments', id), {
        status: 'active',
        cancelledByAdmin: false,
        cancellationReason: deleteField(),
        adminAuth: '123456'
      });
      setShowManageModal(false);
      setManageAppointment(null);
    } catch (err) {
      console.error("Restore error:", err);
      handleFirestoreError(err, 'update', `appointments/${id}`);
    } finally {
      setIsManaging(false);
    }
  };

  const handleCancelAppointment = async (permanent: boolean = false) => {
    if (!manageAppointment) return;
    setIsManaging(true);
    try {
      if (isAdmin) {
        if (permanent) {
          await deleteDoc(doc(db, 'appointments', manageAppointment.id));
        } else {
          await updateDoc(doc(db, 'appointments', manageAppointment.id), {
            status: 'cancelled',
            cancellationReason: adminReason || (isSuddenCancel ? 'Lý do đột xuất từ phía Người kết nối.' : 'Lịch hẹn bị hủy do thông tin sai hoặc yêu cầu thay đổi.'),
            cancelledByAdmin: isSuddenCancel,
            cancelledAt: serverTimestamp(),
            adminAuth: '123456'
          }).catch(err => handleFirestoreError(err, 'update', `appointments/${manageAppointment.id}`));
        }
      } else {
        // Strict PIN Verification
        if (!managePassword) {
          alert("Vui lòng nhập Mã PIN!");
          setIsManaging(false);
          return;
        }

        const storedPassword = (manageAppointment as any).password;
        if (managePassword.trim() !== String(storedPassword).trim()) {
          alert("Sai Mã PIN! Vui lòng kiểm tra lại.");
          setIsManaging(false);
          return;
        }

        await updateDoc(doc(db, 'appointments', manageAppointment.id), {
          status: 'cancelled',
          cancelledAt: serverTimestamp()
        }).catch(err => handleFirestoreError(err, 'update', `appointments/${manageAppointment.id}`));
      }
      setShowManageModal(false);
      setManageAppointment(null);
      setManagePassword('');
      setAdminReason('');
    } catch (err) {
      console.error("Cancel error:", err);
      if (!(err instanceof Error) || !err.message.startsWith('{')) {
        alert("Có lỗi xảy ra. Vui lòng liên hệ quản trị viên.");
      }
    } finally {
      setIsManaging(false);
    }
  };

  const handleCVSearch = async () => {
    if (!cvSearchPIN || !cvSearchPhoneLast4) {
      alert("Vui lòng nhập cả số điện thoại và mã PIN.");
      return;
    }
    setIsSearchingCV(true);
    setFoundCV(null);
    try {
      const q = query(
        collection(db, 'cvs'), 
        where('password', '==', cvSearchPIN), 
        where('phoneLast4', '==', cvSearchPhoneLast4),
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        setFoundCV({ id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() } as CV);
      } else {
        alert("Không tìm thấy CV hợp lệ. Vui lòng kiểm tra lại 4 số cuối SĐT và mã PIN.");
      }
    } catch (err) {
      console.error("CV search error:", err);
      handleFirestoreError(err, 'list', 'cvs');
    } finally {
      setIsSearchingCV(false);
    }
  };

  const exportSingleCV = async (cv: CV) => {
    const { utils, writeFile } = await import('xlsx');
    const data = [
      { 'Trường thông tin': 'Họ tên', 'Giá trị': cv.fullName },
      { 'Trường thông tin': 'Điện thoại', 'Giá trị': cv.phone },
      { 'Trường thông tin': 'Tuổi', 'Giá trị': cv.age },
      { 'Trường thông tin': 'Địa chỉ', 'Giá trị': cv.address },
      { 'Trường thông tin': 'Công việc', 'Giá trị': cv.job },
      { 'Trường thông tin': 'Mong muốn', 'Giá trị': cv.target },
      { 'Trường thông tin': 'Tên HDV', 'Giá trị': cv.guideName },
      { 'Trường thông tin': 'SĐT HDV (4 số cuối)', 'Giá trị': cv.guidePhoneLast4 },
      { 'Trường thông tin': 'Trạng thái', 'Giá trị': cv.status === 'approved' ? 'Đã phê duyệt' : 'Đang chờ duyệt' }
    ];
    const worksheet = utils.json_to_sheet(data);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, 'CV');
    writeFile(workbook, `CV_${cv.fullName.replace(/\s+/g, '_')}.xlsx`);
  };

  const handleCVAutoFill = (text: string) => {
    setCvAutoFillText(text);
    if (!text) return;

    const lines = text.split('\n');
    const newFormData = { ...cvFormData };

    lines.forEach(line => {
      const trimmed = line.trim();
      
      const getValue = (indicator: string, label: string) => {
        if (trimmed.startsWith(indicator)) {
          return trimmed.replace(indicator, '').replace(label, '').replace(':', '').trim();
        }
        if (trimmed.toLowerCase().startsWith(label.toLowerCase())) {
          return trimmed.replace(label, '').replace(':', '').trim();
        }
        return null;
      };

      const fullName = getValue('1.', 'Họ tên');
      if (fullName !== null) newFormData.fullName = fullName;

      const phone = getValue('2.', 'Điện thoại');
      if (phone !== null) newFormData.phone = phone;

      const age = getValue('3.', 'Tuổi');
      if (age !== null) newFormData.age = age;

      const address = getValue('4.', 'Địa Chỉ');
      if (address !== null) newFormData.address = address;

      const job = getValue('5.', 'Công Việc');
      if (job !== null) newFormData.job = job;

      const target = getValue('6.', 'Mong muốn');
      if (target !== null) newFormData.target = target;

      const guideName = getValue('7.', 'Tên hướng dẫn viên');
      if (guideName !== null) newFormData.guideName = guideName;

      const guidePhoneLast4 = getValue('8.', '4 số cuối SĐT của HDV');
      if (guidePhoneLast4 !== null) newFormData.guidePhoneLast4 = guidePhoneLast4;
    });

    setCvFormData(newFormData);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        alert("Kích thước ảnh quá lớn (Phải dưới 1MB). Vui lòng nén ảnh hoặc chụp màn hình thu nhỏ lại.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setCvFormData(prev => ({ ...prev, paymentImageUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCVSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cvFormData.password.length < 4) {
      alert("Mã PIN phải tối thiểu 4 ký tự.");
      return;
    }
    if (!cvFormData.fullName || !cvFormData.phone || !cvFormData.age || !cvFormData.guideName || !cvFormData.guidePhoneLast4) {
      alert("Vui lòng điền đầy đủ các trường bắt buộc (1, 2, 3, 7, 8).");
      return;
    }
    if (cvFormData.phone.replace(/\D/g, '').length < 4) {
      alert("Số điện thoại học viên phải có ít nhất 4 chữ số.");
      return;
    }
    if (cvFormData.guidePhoneLast4.length !== 4) {
      alert("Trường số 8 phải là đúng 4 số cuối của SĐT.");
      return;
    }
    setIsSubmittingCV(true);
    try {
      const phoneLast4 = cvFormData.phone.replace(/\D/g, '').slice(-4);
      await addDoc(collection(db, 'cvs'), {
        ...cvFormData,
        phoneLast4,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      alert("Đã tạo CV thành công! Vui lòng chờ quản trị viên phê duyệt.");
      setCvFormData({ fullName: '', phone: '', age: '', address: '', job: '', target: '', password: '', paymentImageUrl: '', guideName: '', guidePhoneLast4: '' });
      setCvAutoFillText('');
      setShowCVModal(false);
    } catch (err) {
      console.error("CV submit error:", err);
      handleFirestoreError(err, 'create', 'cvs');
      alert("Lỗi khi lưu hồ sơ. Vui lòng thử lại.");
    } finally {
      setIsSubmittingCV(false);
    }
  };

  const handleCVAction = async (cvId: string, type: 'approve' | 'reject' | 'restore') => {
    if (type === 'restore') {
      setCvActionModal({ show: true, cvId, type });
      setAdminPinInput('');
    } else {
      if (!isAdmin) return;
      
      const selectedReviewer = localReviewers[cvId] || REVIEWERS[0];
      setIsProcessingAction(true);
      try {
        const newStatus: CV['status'] = type === 'approve' ? 'approved' : 'rejected';
        
        await updateDoc(doc(db, 'cvs', cvId), {
          status: newStatus,
          processedAt: serverTimestamp(),
          processedBy: selectedReviewer,
          adminAuth: '123456'
        });
      } catch (err) {
        console.error("CV Action error:", err);
        handleFirestoreError(err, 'update', `cvs/${cvId}`);
      } finally {
        setIsProcessingAction(false);
      }
    }
  };

  const confirmCVAction = async () => {
    if (!isAdmin || !cvActionModal.cvId || !cvActionModal.type) return;
    
    // modal is only used for restore now
    if (adminPinInput !== '123456') {
      alert("Mật khẩu quản trị không chính xác!");
      return;
    }

    setIsProcessingAction(true);
    try {
      await updateDoc(doc(db, 'cvs', cvActionModal.cvId), {
        status: 'pending',
        processedAt: serverTimestamp(),
        processedBy: '', // clear reviewer on restore
        adminAuth: '123456'
      });
      
      setCvActionModal({ show: false, cvId: '', type: null });
    } catch (err) {
      console.error("CV Action error:", err);
      handleFirestoreError(err, 'update', `cvs/${cvActionModal.cvId}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const exportCVsToExcel = async () => {
    const { utils, writeFile } = await import('xlsx');
    
    const formatCVData = (items: CV[]) => items.map((cv, index) => ({
      'STT': index + 1,
      'Ngày tham gia': cv.createdAt ? format(cv.createdAt.toDate(), 'dd/MM/yyyy HH:mm') : '',
      'Số điện thoại': cv.phone,
      'Họ tên': cv.fullName,
      'Tuổi': cv.age,
      'Tên hướng dẫn viên': cv.guideName,
      'Ngày admin xử lý': cv.processedAt ? format(cv.processedAt.toDate(), 'dd/MM/yyyy HH:mm') : (cv.status === 'pending' ? 'Chưa xử lý' : 'N/A')
    }));

    const workbook = utils.book_new();

    // Sheet 1: Tất cả
    const allData = formatCVData(cvs);
    utils.book_append_sheet(workbook, utils.json_to_sheet(allData), 'Tất cả');

    // Sheet 2: Chờ phê duyệt
    const pendingData = formatCVData(cvs.filter(c => c.status === 'pending'));
    utils.book_append_sheet(workbook, utils.json_to_sheet(pendingData), 'Chờ phê duyệt');

    // Sheet 3: Đã phê duyệt
    const approvedData = formatCVData(cvs.filter(c => c.status === 'approved'));
    utils.book_append_sheet(workbook, utils.json_to_sheet(approvedData), 'Đã phê duyệt');

    // Sheet 4: Từ chối
    const rejectedData = formatCVData(cvs.filter(c => c.status === 'rejected'));
    utils.book_append_sheet(workbook, utils.json_to_sheet(rejectedData), 'Từ chối');
    
    const filename = `Bao_Cao_CV_Hoc_Vien_${format(new Date(), 'dd_MM_yyyy')}.xlsx`;
    writeFile(workbook, filename);
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
    } catch (err: any) {
      // Suppress the error if the user closed the popup manually
      if (err.code === 'auth/popup-closed-by-user') {
        return;
      }
      
      console.error("Login error:", err);
      // Only show alert for other types of errors
      alert("Đã có lỗi xảy ra khi đăng nhập: " + (err.message || "Vui lòng thử lại sau."));
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
            <h1 className="font-bold text-lg tracking-tight text-slate-900 uppercase">Đặt lịch kết nối</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCVModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-100 text-yellow-700 rounded-xl font-bold text-xs hover:bg-yellow-200 transition-all border border-yellow-200 mr-2"
          >
            <FileText size={16} />
            <span>CV Học viên</span>
          </button>

          {!isAdmin && (
            <div className="flex items-center gap-2 mr-2">
              <button 
                onClick={() => setShowLoginModal(true)}
                className="w-10 h-10 rounded-xl bg-white text-slate-400 border border-slate-200 hover:border-yellow-400 hover:text-yellow-600 transition-all flex items-center justify-center shadow-sm"
                title="Đăng nhập Admin (Mã PIN)"
              >
                <Lock size={18} />
              </button>
              <button 
                onClick={login}
                className="w-10 h-10 rounded-xl bg-white text-slate-400 border border-slate-200 hover:border-yellow-400 hover:text-yellow-600 transition-all flex items-center justify-center shadow-sm"
                title="Đăng nhập Google Admin"
              >
                <User size={18} className="text-yellow-500" />
              </button>
            </div>
          )}

          {isAdmin && (
            <button 
              onClick={() => setView(view === 'booking' ? 'admin' : 'booking')}
              className={cn(
                "w-10 h-10 rounded-full transition-all duration-300 flex items-center justify-center shadow-lg active:scale-90 border-2",
                view === 'admin' 
                  ? "bg-yellow-400 border-amber-500 text-amber-900" 
                  : "bg-yellow-100 border-yellow-300 text-yellow-700 hover:bg-yellow-200"
              )}
              title={view === 'booking' ? 'Mở bảng quản trị' : 'Về trang đặt lịch'}
            >
              <User size={20} strokeWidth={2.5} />
            </button>
          )}

          {(user || isStaticAdmin) && (
            <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
              {user && (
                <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-yellow-400 shadow-sm" referrerPolicy="no-referrer" />
              )}
              {isStaticAdmin && !user && null}
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

      {view === 'booking' && announcement && isAdminMessageVisible && (
        <div className="bg-amber-950 text-white py-2.5 px-6 sticky top-[73px] z-40 overflow-hidden">
          <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 overflow-hidden">
              <span className="shrink-0 flex items-center justify-center p-1.5 bg-yellow-400 text-amber-950 rounded-lg animate-bounce">
                <CheckCircle2 size={12} strokeWidth={3} />
              </span>
              <p className="text-xs font-black uppercase tracking-widest truncate">
                <span className="text-yellow-400 mr-2">[Thông báo]</span>
                {announcement}
              </p>
            </div>
            <button 
              onClick={() => setIsAdminMessageVisible(false)}
              className="p-1 hover:bg-white/10 rounded-md transition-colors shrink-0"
            >
              <ChevronRight size={16} className="rotate-45" />
            </button>
          </div>
          <motion.div 
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            className="absolute bottom-0 left-0 right-0 h-0.5 bg-yellow-400 origin-left opacity-30"
          />
        </div>
      )}

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
              <section className="bg-white rounded-[40px] p-8 lg:p-12 border border-yellow-200 shadow-xl shadow-yellow-100/50 relative">
                {/* Floating Add Button for Overview */}
                {(() => {
                  const today = startOfDay(new Date());
                  const isPastDay = isBefore(selectedDate, today);
                  return (
                    <button
                      onClick={() => {
                        if (isPastDay) {
                          setSelectedDate(today);
                          // We also check if today is finished to maybe jump to tomorrow? 
                          // But the user said "mặc định bắt đầu từ ngày hiện tại" (today).
                        }
                        setOverviewTab('empty');
                      }}
                      className="absolute -top-3 -right-3 px-5 py-2.5 bg-amber-950 text-yellow-400 rounded-[18px] flex flex-col items-center justify-center gap-0.5 shadow-2xl hover:scale-105 active:scale-95 transition-all z-10 border-4 border-white"
                      title="Mở danh sách slot trống"
                    >
                      <Plus size={14} strokeWidth={4} />
                      <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap">Đặt lịch</span>
                    </button>
                  );
                })()}

                <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-6">
                  <div className="space-y-2">
                    <h3 className="text-[10px] font-black text-yellow-600 uppercase tracking-[0.3em]">Tổng quan lịch hẹn</h3>
                    <div className="flex items-center gap-2">
                       <h4 className="text-3xl lg:text-4xl font-serif font-black text-slate-900 tracking-tight leading-none capitalize">
                        {format(selectedDate, 'eeee, dd/MM', { locale: vi })}
                      </h4>

                      <div className="flex items-center ml-2">
                        <button 
                          onClick={() => { setSelectedDate(addDays(selectedDate, -1)); setSelectedSlot(null); }}
                          className="p-2 text-slate-300 hover:text-yellow-600 hover:bg-yellow-50 rounded-xl transition-all active:scale-90"
                          title="Ngày trước"
                        >
                          <ChevronLeft size={24} strokeWidth={2.5} />
                        </button>

                        <button 
                          onClick={() => { setSelectedDate(addDays(selectedDate, 1)); setSelectedSlot(null); }}
                          className="p-2 text-slate-300 hover:text-yellow-600 hover:bg-yellow-50 rounded-xl transition-all active:scale-90"
                          title="Ngày mai"
                        >
                          <ChevronRight size={24} strokeWidth={2.5} />
                        </button>

                        <button 
                          onClick={() => setShowCalendarPicker(true)}
                          className="p-2 ml-2 bg-yellow-50 text-yellow-600 hover:bg-yellow-100 rounded-xl transition-all active:scale-90 border border-yellow-100"
                          title="Chọn ngày từ lịch"
                        >
                          <CalendarIcon size={20} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-4">
                    <button 
                      onClick={() => setOverviewTab('past')}
                      className={cn(
                        "text-left px-6 py-3 rounded-2xl border transition-all active:scale-95",
                        overviewTab === 'past' 
                          ? "bg-yellow-400 text-amber-950 border-yellow-400 shadow-lg" 
                          : "bg-slate-50 text-slate-600 border-slate-100 hover:border-amber-200"
                      )}
                    >
                      <p className={cn("text-sm font-black leading-tight", overviewTab === 'past' ? "text-amber-950" : "text-amber-950 font-black")}>
                        {appointments.filter(a => {
                          const today = startOfDay(new Date());
                          const isPastDay = isBefore(selectedDate, today);
                          const isSelectedToday = isSameDay(selectedDate, new Date());
                          const currentTimeStr = format(now, 'HH:mm');
                          return a.status === 'active' && (isPastDay || (isSelectedToday && (a.endTime || '23:59') <= currentTimeStr));
                        }).length} phiên
                      </p>
                      <p className={cn("text-[10px] uppercase font-bold tracking-widest", overviewTab === 'past' ? "text-amber-800" : "text-yellow-700")}>Đã kết thúc</p>
                    </button>

                    <button 
                      onClick={() => setOverviewTab('active')}
                      className={cn(
                        "text-left px-6 py-3 rounded-2xl border transition-all active:scale-95",
                        overviewTab === 'active' 
                          ? "bg-yellow-400 text-amber-950 border-yellow-400 shadow-lg" 
                          : "bg-slate-50 text-slate-600 border-slate-100 hover:border-amber-200"
                      )}
                    >
                      <p className={cn("text-sm font-black leading-tight", overviewTab === 'active' ? "text-amber-950" : "text-amber-950 font-black")}>
                        {(() => {
                           const today = startOfDay(new Date());
                           const isPastDay = isBefore(selectedDate, today);
                           if (isPastDay) return 0;
                           const isSelectedToday = isSameDay(selectedDate, new Date());
                           const currentTimeStr = format(now, 'HH:mm');
                           return appointments.filter(a => a.status === 'active' && (!isSelectedToday || (a.endTime || '23:59') > currentTimeStr)).length;
                        })()} phiên
                      </p>
                      <p className={cn("text-[10px] uppercase font-bold tracking-widest", overviewTab === 'active' ? "text-amber-800" : "text-yellow-700")}>Xem lịch đã đặt</p>
                    </button>

                    <button 
                      onClick={() => setOverviewTab('empty')}
                      className={cn(
                        "text-left px-6 py-3 rounded-2xl border transition-all active:scale-95 group",
                        overviewTab === 'empty' ? "bg-yellow-400 text-amber-950 border-yellow-400 shadow-lg" : "bg-white border-yellow-200",
                        isBefore(selectedDate, startOfDay(new Date())) && "opacity-50 cursor-not-allowed pointer-events-none"
                      )}
                    >
                      <p className="text-sm font-black leading-tight">
                        {(() => {
                          const today = startOfDay(new Date());
                          if (isBefore(selectedDate, today)) return 0;
                          const takenSlotStartTimes = new Set(appointments.filter(a => a.status !== 'cancelled').map(a => a.startTime));
                          const isSelectedToday = isSameDay(selectedDate, new Date());
                          const currentTimeStr = format(now, 'HH:mm');
                          return slots.filter(s => {
                            const isPastSlot = isSelectedToday && s <= currentTimeStr;
                            return !takenSlotStartTimes.has(s) && !isPastSlot && !lockedSlots.some(l => l.startTime === s);
                          }).length;
                        })()} slot
                      </p>
                      <p className={cn("text-[10px] uppercase font-bold tracking-widest", overviewTab === 'empty' ? "text-amber-900" : "text-yellow-600")}>Còn trống</p>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 min-h-[120px]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${format(selectedDate, 'yyyy-MM-dd')}-${overviewTab}`}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="col-span-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                    >
                      {(() => {
                        const today = startOfDay(new Date());
                        const isPastDay = isBefore(selectedDate, today);
                        const isSelectedToday = isSameDay(selectedDate, new Date());
                        const currentTimeStr = format(now, 'HH:mm');
                        
                        // All active appointments on a past day are considered past
                        const pastApps = appointments.filter(a => 
                          a.status === 'active' && (isPastDay || (isSelectedToday && (a.endTime || '23:59') <= currentTimeStr))
                        );
                        // Active apps only exist on today or future
                        const activeApps = appointments.filter(a => 
                          a.status === 'active' && !isPastDay && (!isSelectedToday || (a.endTime || '23:59') > currentTimeStr)
                        );
                        // Cancelled apps
                        const cancelledApps = appointments.filter(a => 
                          (a.status === 'cancelled' && a.cancelledByAdmin) && !isPastDay && (!isSelectedToday || (a.endTime || '23:59') > currentTimeStr)
                        );

                        if (overviewTab === 'past') {
                          if (pastApps.length === 0) return (
                            <div className="col-span-full py-12 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Không có lịch hẹn nào đã kết thúc trong ngày này</p>
                            </div>
                          );

                          return (
                            <div className="col-span-full space-y-10">
                              {businessHours.map((range, bIdx) => {
                                const rangeApps = pastApps.filter(a => {
                                  const hour = parseInt(a.startTime.split(':')[0]);
                                  return (hour >= range.start && hour < range.end) || (range.label === 'Chiều' && hour === range.end);
                                }).sort((a,b) => a.startTime.localeCompare(b.startTime));

                                if (rangeApps.length === 0) return null;

                                return (
                                  <div key={bIdx} className="space-y-6">
                                    <div className="flex items-center gap-4">
                                      <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">
                                        BUỔI {range.label.toUpperCase()}
                                      </h3>
                                      <div className="h-px flex-1 bg-slate-100" />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                      {rangeApps.map((app) => (
                                        <div key={app.id} className="p-4 rounded-2xl border bg-slate-50 border-slate-100 opacity-40 grayscale flex items-start justify-between gap-4">
                                          <div className="flex items-start gap-4 overflow-hidden w-full">
                                            <div className="px-3 py-2 rounded-xl bg-slate-200 text-slate-500 font-mono text-sm font-black shrink-0">
                                              {app.startTime}
                                            </div>
                                            <div className="overflow-hidden flex-1">
                                              <h5 className="font-bold truncate leading-tight text-slate-500">{app.clientName}</h5>
                                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                                                {app.guide}
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }

                        if (overviewTab === 'active') {
                          const displayList = [...activeApps, ...cancelledApps];
                          if (displayList.length === 0) return (
                            <div className="col-span-full py-12 border-2 border-dashed border-slate-100 rounded-3xl flex flex-col items-center justify-center text-center bg-slate-50/20">
                              <CalendarDays size={24} className="text-slate-200 mb-3" />
                              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Hiện không có lịch hẹn mới</p>
                            </div>
                          );

                          return (
                            <div className="col-span-full space-y-10">
                              {businessHours.map((range, bIdx) => {
                                const rangeApps = displayList.filter(a => {
                                  const hour = parseInt(a.startTime.split(':')[0]);
                                  return (hour >= range.start && hour < range.end) || (range.label === 'Chiều' && hour === range.end);
                                }).sort((a,b) => {
                                  const getPriority = (app: any) => {
                                    const isOngoing = isSelectedToday && currentTimeStr >= app.startTime && currentTimeStr < (app.endTime || '23:59');
                                    return isOngoing ? 0 : 1;
                                  };
                                  const pA = getPriority(a);
                                  const pB = getPriority(b);
                                  if (pA !== pB) return pA - pB;
                                  return a.startTime.localeCompare(b.startTime);
                                });

                                if (rangeApps.length === 0) return null;

                                return (
                                  <div key={bIdx} className="space-y-6">
                                    <div className="flex items-center gap-4">
                                      <h3 className="text-[11px] font-black text-yellow-600 uppercase tracking-[0.2em] whitespace-nowrap">
                                        BUỔI {range.label.toUpperCase()}
                                      </h3>
                                      <div className="h-px flex-1 bg-yellow-100/50" />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                      {rangeApps.map((app) => {
                                        const isInProgress = isSelectedToday && currentTimeStr >= app.startTime && currentTimeStr < (app.endTime || '23:59');
                                        return (
                                          <div key={app.id} className={cn(
                                            "p-4 rounded-3xl border transition-all flex items-start justify-between gap-4 group relative",
                                            app.status === 'cancelled' 
                                              ? "bg-red-50/50 border-red-100 opacity-80" 
                                              : isInProgress
                                                ? "bg-yellow-50 border-yellow-400 shadow-lg shadow-yellow-100 ring-2 ring-yellow-200"
                                                : "bg-white border-slate-100 shadow-sm hover:border-yellow-300 hover:bg-yellow-50/30"
                                          )}>
                                            <div className="flex items-start gap-4 overflow-hidden w-full">
                                              <div className={cn(
                                                "px-3 py-2 rounded-2xl font-mono text-sm font-black shadow-lg shrink-0 text-center",
                                                app.status === 'cancelled' 
                                                  ? "bg-red-400 text-white shadow-red-100" 
                                                  : isInProgress
                                                    ? "bg-amber-950 text-yellow-400 shadow-amber-900/20 animate-pulse"
                                                    : "bg-yellow-400 text-amber-950 shadow-yellow-200/50"
                                              )}>
                                                {app.startTime}
                                              </div>
                                              <div className="overflow-hidden flex-1">
                                                <div className="flex items-center gap-2">
                                                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 whitespace-nowrap">
                                                    {isInProgress ? 'Đang diễn ra' : 'Học viên'}
                                                  </p>
                                                  {app.status === 'cancelled' && (
                                                    <span className="text-[8px] font-black text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full uppercase tracking-tighter">Đã hủy</span>
                                                  )}
                                                </div>
                                                <h5 className={cn("font-bold truncate leading-tight", app.status === 'cancelled' ? "text-slate-500 line-through" : "text-slate-900")}>
                                                  {app.clientName}
                                                </h5>
                                                <p className={cn("text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 mt-1", isInProgress ? "text-yellow-700" : "text-yellow-600")}>
                                                  {app.guide}
                                                </p>
                                              </div>
                                            </div>
                                            {app.status !== 'cancelled' && (
                                              <button onClick={() => { setManageAppointment(app); setShowManageModal(true); }}
                                                className="flex flex-col items-center gap-1 p-2 text-slate-300 hover:text-red-500 transition-all shrink-0 hover:bg-red-50 rounded-xl">
                                                <Trash2 size={16} />
                                                <span className="text-[8px] font-black uppercase tracking-tighter">Hủy</span>
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }

                        if (overviewTab === 'empty') {
                          const today = startOfDay(new Date());
                          if (isBefore(selectedDate, today)) return (
                            <div className="col-span-full py-12 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Không thể đặt lịch cho ngày đã qua</p>
                            </div>
                          );

                          const takenSlotStartTimes = new Set(appointments.filter(a => a.status !== 'cancelled').map(a => a.startTime));
                          const freeSlots = slots.filter(s => {
                            const isPastSlot = isSelectedToday && s <= currentTimeStr;
                            return !takenSlotStartTimes.has(s) && !isPastSlot && !lockedSlots.some(l => l.startTime === s);
                          });

                          if (freeSlots.length === 0) return (
                            <div className="col-span-full py-12 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Không còn slot trống trong ngày này</p>
                            </div>
                          );

                          return (
                            <div className="col-span-full space-y-10">
                              {businessHours.map((range, bIdx) => {
                                const rangeSlots = freeSlots.filter(s => {
                                  const hour = parseInt(s.split(':')[0]);
                                  return (hour >= range.start && hour < range.end) || (range.label === 'Chiều' && hour === range.end);
                                });

                                if (rangeSlots.length === 0) return null;

                                return (
                                  <div key={bIdx} className="space-y-6">
                                    <div className="flex items-center gap-4">
                                      <h3 className="text-[11px] font-black text-yellow-600 uppercase tracking-[0.2em] whitespace-nowrap">
                                        BUỔI {range.label.toUpperCase()}
                                      </h3>
                                      <div className="h-px flex-1 bg-yellow-100/50" />
                                    </div>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                                      {rangeSlots.map((slot) => (
                                        <button
                                          key={slot}
                                          onClick={() => {
                                            setSelectedSlot(slot);
                                            setFormData({ name: '', guide: '', question: '', password: '' });
                                            setShowBookingModal(true);
                                          }}
                                          className="px-4 py-4 rounded-3xl border border-slate-200 bg-white text-slate-900 font-mono text-sm font-black transition-all hover:bg-yellow-400 hover:border-yellow-400 hover:text-amber-950 hover:shadow-xl hover:shadow-yellow-100 active:scale-95 group relative flex items-center justify-center"
                                        >
                                          {slot}
                                          <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 border-2 border-white opacity-0 group-hover:opacity-100 transition-all scale-0 group-hover:scale-100" />
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }
                      })()}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </section>

              {/* Instruction Guide Section */}
              <section className="bg-white rounded-[40px] border border-yellow-200 shadow-xl shadow-yellow-100/50 p-8 lg:p-12">
                <div className="flex flex-col lg:flex-row gap-12">
                  <div className="lg:w-1/3 space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-yellow-400 rounded-2xl flex items-center justify-center text-amber-950 shadow-lg shadow-yellow-100">
                        <Edit3 size={24} />
                      </div>
                      <div>
                        <h3 className="text-xs font-black text-yellow-600 uppercase tracking-widest mb-1">Hướng dẫn</h3>
                        <p className="text-2xl font-black text-slate-900 leading-none">3 BƯỚC ĐẶT LỊCH</p>
                      </div>
                    </div>
                    <p className="text-sm text-slate-500 font-medium leading-relaxed">
                      Chỉ mất 1 phút để kết nối. Vui lòng thực hiện theo các bước bên phải để đảm bảo lịch hẹn được ghi nhận thành công.
                    </p>
                    
                    <div className="pt-6 border-t border-slate-100 space-y-4">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 size={18} className="text-green-500 shrink-0" />
                        <p className="text-xs font-bold text-slate-600 italic">Lịch hẹn sẽ được gửi xác nhận ngay sau khi lưu.</p>
                      </div>
                      <div className="bg-yellow-50 p-4 rounded-2xl border border-yellow-100 space-y-2">
                         <p className="text-[10px] font-black text-yellow-700 uppercase tracking-widest flex items-center gap-2">
                           Lưu ý quan trọng
                         </p>
                         <p className="text-[11px] text-yellow-800 font-medium leading-normal">
                           - Mỗi mã PIN là duy nhất để bảo mật lịch của bạn.<br/>
                           - Vui lòng kiểm tra kỹ khung giờ "Sáng" hoặc "Chiều" trước khi chọn.
                         </p>
                      </div>
                      <button 
                        onClick={() => window.open('https://youtube.com/shorts/Hdg8yxv2BqM', '_blank')}
                        className="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-red-100 hover:bg-red-700 transition-all flex items-center justify-center gap-3 active:scale-95"
                      >
                        <Play size={16} fill="currentColor" />
                        Xem Video Hướng Dẫn
                      </button>
                    </div>
                  </div>

                  <div className="lg:w-2/3 grid grid-cols-1 sm:grid-cols-3 gap-6 relative">
                    {/* Step 1 */}
                    <div className="relative p-6 bg-slate-50 rounded-3xl border border-slate-100 hover:border-yellow-300 transition-colors group">
                      <div className="absolute -top-3 -left-3 w-8 h-8 bg-white border-2 border-yellow-400 rounded-full flex items-center justify-center text-sm font-black text-yellow-600 shadow-sm">1</div>
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 mb-4 shadow-sm group-hover:text-yellow-500 transition-colors">
                        <CalendarIcon size={20} />
                      </div>
                      <h4 className="font-black text-slate-900 text-sm mb-2 uppercase tracking-tight">Chọn ngày</h4>
                      <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">Sử dụng nút mũi tên hoặc biểu tượng lịch ở trên để chọn ngày muốn đặt.</p>
                    </div>

                    {/* Step 2 */}
                    <div className="relative p-6 bg-slate-50 rounded-3xl border border-slate-100 hover:border-yellow-300 transition-colors group">
                      <div className="absolute -top-3 -left-3 w-8 h-8 bg-white border-2 border-yellow-400 rounded-full flex items-center justify-center text-sm font-black text-yellow-600 shadow-sm">2</div>
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 mb-4 shadow-sm group-hover:text-yellow-500 transition-colors font-black uppercase text-[10px]">
                        Slot
                      </div>
                      <h4 className="font-black text-slate-900 text-sm mb-2 uppercase tracking-tight">Tìm khung giờ</h4>
                      <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">Nhấn nút "ĐẶT LỊCH" để xem các khung giờ "Còn trống" (màu vàng nhạt).</p>
                    </div>

                    {/* Step 3 */}
                    <div className="relative p-6 bg-slate-50 rounded-3xl border border-slate-100 hover:border-yellow-300 transition-colors group">
                      <div className="absolute -top-3 -left-3 w-8 h-8 bg-white border-2 border-yellow-400 rounded-full flex items-center justify-center text-sm font-black text-yellow-600 shadow-sm">3</div>
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 mb-4 shadow-sm group-hover:text-yellow-500 transition-colors">
                        <CheckCircle2 size={20} />
                      </div>
                      <h4 className="font-black text-slate-900 text-sm mb-2 uppercase tracking-tight">Xác nhận</h4>
                      <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">Chọn giờ, điền thông tin & Mã PIN để hoàn tất quá trình kết nối.</p>
                    </div>

                    {/* Desktop Connector Arrows */}
                    <div className="hidden sm:block absolute top-1/2 left-1/3 -translate-y-1/2 -ml-3 text-yellow-200">
                      <ChevronRight size={20} />
                    </div>
                    <div className="hidden sm:block absolute top-1/2 left-2/3 -translate-y-1/2 -ml-3 text-yellow-200">
                      <ChevronRight size={20} />
                    </div>
                  </div>
                </div>
              </section>
            </motion.div>
          ) : (
            <motion.div 
              key="admin"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-12"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-8 border-b border-slate-100">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight text-slate-900">Quản trị hệ thống</h2>
                  <p className="text-slate-500 mt-1 font-medium">{format(selectedDate, 'EEEE, d MMMM yyyy', { locale: vi })}</p>
                </div>

                <div className="flex bg-slate-100 p-1 rounded-2xl">
                  {[
                    { id: 'appointments', label: 'Lịch hẹn', icon: <CalendarDays size={16} /> },
                    { id: 'config', label: 'Cấu hình lịch hẹn', icon: <Clock size={16} /> },
                    { id: 'cancelled', label: 'Hủy lịch', icon: <Trash2 size={16} /> },
                    { id: 'cvs', label: 'Quản lý CV', icon: <FileText size={16} /> },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveAdminTab(tab.id as any)}
                      className={cn(
                        "flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                        activeAdminTab === tab.id 
                          ? "bg-white text-slate-900 shadow-sm" 
                          : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
                      )}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-12">
                {activeAdminTab === 'config' && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                    {/* 1. Khung mặc định (Global settings) */}
                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-yellow-400 flex items-center justify-center text-amber-950">
                          <Settings size={20} />
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-slate-900 tracking-tight">Cấu hình mặc định</h3>
                          <p className="text-xs text-slate-400 font-medium italic">Áp dụng chung cho toàn bộ hệ thống</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
                        <div className="space-y-4">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Khung giờ làm việc mặc định</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {businessHours.map((range, rbIdx) => (
                              <div key={rbIdx} className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 group hover:border-yellow-400 transition-all">
                                <span className="text-[10px] text-slate-500 font-black uppercase w-12">{range.label}</span>
                                <div className="flex items-center gap-2">
                                  <select value={range.start} onChange={(e) => {
                                    const newRanges = [...businessHours];
                                    newRanges[rbIdx].start = parseFloat(e.target.value);
                                    updateSettings({ businessHours: newRanges });
                                  }} className="bg-white border border-slate-200 text-xs font-bold p-2 rounded-xl outline-none">
                                    {getTimeOptions(range.label, slotDuration).map(val => <option key={val} value={val}>{formatTime(val)}</option>)}
                                  </select>
                                  <span className="text-slate-300">→</span>
                                  <select value={range.end} onChange={(e) => {
                                    const newRanges = [...businessHours];
                                    newRanges[rbIdx].end = parseFloat(e.target.value);
                                    updateSettings({ businessHours: newRanges });
                                  }} className="bg-white border border-slate-200 text-xs font-bold p-2 rounded-xl outline-none">
                                    {getTimeOptions(range.label, slotDuration).map(val => <option key={val} value={val}>{formatTime(val)}</option>)}
                                  </select>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-8">
                          <div className="space-y-4">
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Thời lượng mỗi phiên mặc định</p>
                             <div className="flex flex-wrap gap-2">
                               {[15, 20, 30].map(val => (
                                 <button key={val} onClick={() => updateSettings({ slotDuration: val })} 
                                   className={cn("px-6 py-3 rounded-2xl text-[11px] font-black transition-all border-2",
                                   slotDuration === val ? "bg-yellow-400 text-amber-950 border-yellow-400 shadow-xl shadow-yellow-100" : "bg-white text-slate-400 border-slate-100 hover:border-yellow-200")}>
                                   {val} phút
                                 </button>
                               ))}
                             </div>
                          </div>
                          
                          <div className="space-y-4">
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Thông báo trên trang chủ</p>
                             <div className="flex gap-2">
                               <input type="text" value={announcement} onChange={(e) => setAnnouncement(e.target.value)}
                                 placeholder="Gửi lời chào hoặc thông báo đến học viên..."
                                 className="flex-1 px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-sm font-bold focus:bg-white focus:border-yellow-400 transition-all" />
                               <button onClick={() => updateSettings({ announcement })}
                                 className="px-6 py-3 bg-amber-950 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg">Lưu</button>
                             </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 2. Lịch (Year/Month Overview) */}
                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                       <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
                              <Calendar size={20} />
                            </div>
                            <div>
                               <h3 className="text-lg font-black text-slate-900 tracking-tight">Tổng quan lịch</h3>
                               <p className="text-xs text-slate-400 font-medium italic">Chọn ngày để tùy chỉnh khung giờ riêng</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                            <button onClick={() => setCurrentMonth(addMonths(currentMonth, -1))} className="p-3 hover:bg-white rounded-xl text-slate-500 shadow-sm transition-all"><ChevronLeft size={18} /></button>
                            <span className="min-w-[140px] text-center font-black text-sm text-slate-900 uppercase tracking-widest tabular-nums">{format(currentMonth, 'MMMM yyyy', { locale: vi })}</span>
                            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-3 hover:bg-white rounded-xl text-slate-500 shadow-sm transition-all"><ChevronRight size={18} /></button>
                          </div>
                       </div>

                       <div className="grid grid-cols-7 gap-2 max-w-2xl mx-auto">
                          {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => (
                            <div key={d} className="text-[11px] font-black text-slate-300 text-center uppercase py-3">{d}</div>
                          ))}
                          {(() => {
                            const start = startOfMonth(currentMonth);
                            const end = endOfMonth(currentMonth);
                            const days = eachDayOfInterval({ start, end });
                            const firstDay = getDay(start);
                            const padding = firstDay === 0 ? 6 : firstDay - 1;
                            const result = [];
                            for (let i = 0; i < padding; i++) result.push(<div key={`pad-${i}`} />);
                            days.forEach(day => {
                              const dateStr = format(day, 'yyyy-MM-dd');
                              const isSelected = isSameDay(day, selectedDate);
                              const hasConfig = allDayConfigs[dateStr];
                              result.push(
                                <button key={dateStr} onClick={() => setSelectedDate(day)}
                                  className={cn("h-12 w-full rounded-2xl text-xs font-black flex flex-col items-center justify-center transition-all relative group",
                                  isSelected ? "bg-amber-950 text-white shadow-xl scale-110 z-10" :
                                  hasConfig ? "bg-yellow-400 text-amber-950 shadow-md" : "hover:bg-slate-50 text-slate-600 border border-transparent hover:border-slate-100")}>
                                  {format(day, 'd')}
                                  {hasConfig && !isSelected && <div className="absolute bottom-1.5 w-1 h-1 rounded-full bg-amber-950/20" />}
                                </button>
                              );
                            });
                            return result;
                          })()}
                       </div>
                       
                        <div className="flex flex-wrap gap-6 justify-center mt-10 pt-8 border-t border-slate-50">
                           <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-yellow-400" />
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Đã có cấu hình riêng</span>
                           </div>
                           <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-amber-950" />
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ngày đang chọn</span>
                           </div>
                           <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-slate-100" />
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mặc định</span>
                           </div>
                        </div>
                     </div>

                     {/* 3. Cấu hình ngày (Selected Date Config) */}
                     <div className="bg-amber-50/50 p-8 rounded-[2.5rem] border border-amber-100 space-y-8">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                           <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-2xl bg-amber-950 flex items-center justify-center text-white">
                               <Edit3 size={20} />
                             </div>
                             <div>
                                <h3 className="text-lg font-black text-slate-900 tracking-tight">Tùy chỉnh ngày {format(selectedDate, 'dd/MM/yyyy')}</h3>
                                <div className="flex items-center gap-2">
                                  <p className="text-xs text-slate-500 font-medium italic">Ghi đè cấu hình mặc định cho ngày này</p>
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter",
                                    currentDayConfig ? "bg-yellow-100 text-yellow-700" : "bg-slate-100 text-slate-400"
                                  )}>
                                    {currentDayConfig ? 'Đang dùng cấu hình riêng' : 'Đang dùng mặc định'}
                                  </span>
                                </div>
                             </div>
                           </div>

                           <div className="flex items-center gap-4">
                             <label className="flex items-center gap-4 cursor-pointer bg-white px-6 py-3 rounded-2xl border border-amber-200 shadow-sm hover:border-yellow-400 transition-all group">
                               <div className={cn(
                                 "w-10 h-5 rounded-full transition-all relative flex items-center",
                                 editingDayConfig ? "bg-yellow-400" : "bg-slate-200"
                               )}>
                                 <div className={cn(
                                   "absolute w-3.5 h-3.5 bg-white rounded-full transition-all shadow-sm",
                                   editingDayConfig ? "left-[22px]" : "left-[3px]"
                                 )} />
                               </div>
                               <input 
                                 type="checkbox" 
                                 className="hidden" 
                                 checked={!!editingDayConfig} 
                                 onChange={(e) => {
                                   if (e.target.checked) {
                                     setEditingDayConfig(currentDayConfig || {
                                       morningActive: true,
                                       afternoonActive: true,
                                       duration: slotDuration,
                                       businessHours: businessHours
                                     });
                                   } else {
                                     if (currentDayConfig) {
                                        if (confirm("Về lại mặc định cho ngày này? Mọi tùy chỉnh sẽ bị xóa.")) {
                                          deleteDoc(doc(db, 'dayConfigs', format(selectedDate, 'yyyy-MM-dd')));
                                          setEditingDayConfig(null);
                                        }
                                     } else {
                                        setEditingDayConfig(null);
                                     }
                                   }
                                 }}
                               />
                               <span className="text-xs font-black text-slate-700 uppercase tracking-widest leading-none">Cấu hình riêng</span>
                             </label>

                             {(editingDayConfig && JSON.stringify(editingDayConfig) !== JSON.stringify(currentDayConfig || {
                                morningActive: true,
                                afternoonActive: true,
                                duration: slotDuration,
                                businessHours: businessHours
                             })) && (
                               <button onClick={() => updateDayConfig(editingDayConfig)}
                                 className="px-6 py-3 bg-amber-950 text-white text-[10px] font-black rounded-2xl border border-amber-950 uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-amber-900/20 flex items-center gap-2">
                                 <Plus size={14} className="text-yellow-400" />
                                 {currentDayConfig ? 'Lưu thay đổi' : 'Áp dụng ngay'}
                               </button>
                             )}
                           </div>
                        </div>

                        <div className={cn(
                          "grid grid-cols-1 xl:grid-cols-2 gap-12 transition-all duration-300",
                          !editingDayConfig && "opacity-30 pointer-events-none filter grayscale saturate-0"
                        )}>
                          <div className="space-y-4">
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Trạng thái hoạt động</p>
                             <div className="flex gap-4">
                                <label className="flex-1 flex items-center gap-4 cursor-pointer p-4 bg-white rounded-2xl border border-amber-100 hover:border-yellow-400 transition-all shadow-sm">
                                  <input type="checkbox" checked={editingDayConfig?.morningActive ?? true} onChange={(e) => setEditingDayConfig({ ...editingDayConfig, morningActive: e.target.checked })}
                                    className="w-6 h-6 rounded-lg text-amber-950 focus:ring-yellow-400" />
                                  <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Mở Buổi Sáng</span>
                                </label>
                                <label className="flex-1 flex items-center gap-4 cursor-pointer p-4 bg-white rounded-2xl border-amber-100 hover:border-yellow-400 transition-all shadow-sm">
                                  <input type="checkbox" checked={editingDayConfig?.afternoonActive ?? true} onChange={(e) => setEditingDayConfig({ ...editingDayConfig, afternoonActive: e.target.checked })}
                                    className="w-6 h-6 rounded-lg text-amber-950 focus:ring-yellow-400" />
                                  <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Mở Buổi Chiều</span>
                                </label>
                             </div>
                          </div>

                          <div className="space-y-4">
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Thời lượng phiên riêng ngày này</p>
                             <div className="flex gap-3">
                               {[15, 20, 30].map(val => (
                                 <button key={val} onClick={() => setEditingDayConfig({ ...editingDayConfig, duration: val })}
                                   className={cn("px-6 py-3 rounded-2xl text-[11px] font-black transition-all border-2",
                                   (editingDayConfig?.duration ?? slotDuration) === val ? "bg-amber-950 text-white border-amber-950" : "bg-white text-slate-400 border-amber-50 hover:border-amber-200")}>
                                   {val} phút
                                 </button>
                               ))}
                             </div>
                          </div>

                          <div className="xl:col-span-2 space-y-4">
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Khung giờ làm việc tùy chỉnh</p>
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                               {(editingDayConfig?.businessHours || businessHours).map((range, rbIdx) => (
                                 <div key={rbIdx} className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-amber-100">
                                   <span className="text-[10px] text-amber-900 font-black uppercase w-12">{range.label}</span>
                                   <div className="flex items-center gap-2">
                                     <select value={range.start} onChange={(e) => {
                                       const newRanges = [...(editingDayConfig?.businessHours || businessHours)];
                                       newRanges[rbIdx] = { ...newRanges[rbIdx], start: parseFloat(e.target.value) };
                                       setEditingDayConfig({ ...editingDayConfig, businessHours: newRanges });
                                     }} className="bg-slate-50 border border-slate-100 text-xs font-bold p-2 rounded-xl outline-none">
                                       {getTimeOptions(range.label, editingDayConfig?.duration || slotDuration).map(val => <option key={val} value={val}>{formatTime(val)}</option>)}
                                     </select>
                                     <span className="text-slate-300">→</span>
                                     <select value={range.end} onChange={(e) => {
                                       const newRanges = [...(editingDayConfig?.businessHours || businessHours)];
                                       newRanges[rbIdx] = { ...newRanges[rbIdx], end: parseFloat(e.target.value) };
                                       setEditingDayConfig({ ...editingDayConfig, businessHours: newRanges });
                                     }} className="bg-slate-50 border border-slate-100 text-xs font-bold p-2 rounded-xl outline-none">
                                       {getTimeOptions(range.label, editingDayConfig?.duration || slotDuration).map(val => <option key={val} value={val}>{formatTime(val)}</option>)}
                                     </select>
                                   </div>
                                 </div>
                               ))}
                             </div>
                          </div>
                       </div>
                    </div>
                  </motion.div>
                )}

                {activeAdminTab === 'appointments' && (
                  <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-12">
                    <div className="flex items-center justify-between px-2">
                       <div className="flex items-center gap-4">
                        <CalendarDays className="text-yellow-500" />
                        <h3 className="text-xl font-bold text-slate-900 tracking-tight">Timeline lịch hẹn trong ngày</h3>
                       </div>
                       
                       <div className="flex items-center gap-4">
                         <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-200">
                           <div className="px-4 font-black text-sm text-slate-900 tabular-nums border-r border-slate-100 mr-1">{format(selectedDate, 'dd/MM/yyyy')}</div>
                           <div className="flex items-center">
                            <button onClick={() => setSelectedDate(addDays(selectedDate, -1))} className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400" title="Ngày trước"><ChevronLeft size={16} /></button>
                            <button onClick={() => setSelectedDate(addDays(selectedDate, 1))} className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400" title="Ngày mai"><ChevronRight size={18} /></button>
                           </div>
                         </div>
                       </div>
                    </div>

                    <div className="space-y-4 relative">
                      <div className="absolute left-[39px] top-0 bottom-0 w-px bg-slate-100" />
                      
                      {(() => {
                        const isSelectedToday = isSameDay(selectedDate, new Date());
                        const currentTimeStr = format(now, 'HH:mm');
                        
                        const filteredApps = [...appointments]
                          .filter(a => (a as any).status !== 'cancelled')
                          .filter(a => {
                            if (!isSelectedToday) return true;
                            // Hide if end time is past
                            return (a.endTime || '23:59') > currentTimeStr;
                          })
                          .sort((a, b) => a.startTime.localeCompare(b.startTime));

                        if (filteredApps.length === 0) return (
                          <div className="bg-slate-50 rounded-[40px] p-24 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
                            <CalendarDays size={48} className="text-slate-200 mb-4" />
                            <h3 className="text-lg font-bold text-slate-400 italic">Hôm nay chưa có lịch hẹn</h3>
                          </div>
                        );

                        return filteredApps.map((app, idx) => {
                          const isInProgress = isSelectedToday && currentTimeStr >= app.startTime && currentTimeStr < (app.endTime || '23:59');
                          
                          return (
                            <div key={app.id} className="flex items-start gap-8 relative group">
                              <div className="w-20 pt-4 flex flex-col items-center">
                                <span className={cn(
                                  "text-lg font-black tabular-nums transition-colors",
                                  isInProgress ? "text-yellow-600" : "text-slate-400"
                                )}>{app.startTime}</span>
                                {isInProgress && <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse mt-2" />}
                                <div className="h-4" />
                              </div>
                              <div className={cn(
                                "flex-1 p-6 rounded-3xl border transition-all flex items-center justify-between",
                                isInProgress 
                                  ? "bg-yellow-50 border-yellow-200 shadow-lg shadow-yellow-100/50 border-l-[6px] border-l-yellow-400" 
                                  : "bg-white border-slate-100 shadow-sm hover:shadow-xl hover:border-yellow-200 border-l-4 border-l-slate-200"
                              )}>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-3">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Học viên</p>
                                    {isInProgress && (
                                      <span className="px-2 py-0.5 bg-yellow-400 text-amber-950 text-[8px] font-black rounded-full uppercase tracking-tighter animate-pulse">
                                        Đang diễn ra
                                      </span>
                                    )}
                                  </div>
                                  <h4 className="text-xl font-black text-slate-900 tracking-tight">{app.clientName}</h4>
                                  <div className="flex items-center gap-8 text-[11px] font-medium text-slate-500 pt-1">
                                    <span className="flex items-center gap-1.5"><User size={14} className="text-yellow-600" /> {app.guide}</span>
                                    <span className="flex items-center gap-1.5 italic"><MessageSquare size={14} className="text-yellow-600" /> {app.question}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button 
                                    onClick={() => { setManageAppointment(app); setShowManageModal(true); }}
                                    className="p-4 text-slate-300 hover:text-red-500 bg-slate-50 rounded-[24px] opacity-0 group-hover:opacity-100 transition-all hover:scale-105 active:scale-95"
                                  >
                                    <Trash2 size={20} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </motion.div>
                )}

                {activeAdminTab === 'cancelled' && (
                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                    <div className="flex items-center justify-between px-2">
                       <div className="flex items-center gap-4">
                        <Trash2 className="text-red-500" />
                        <h3 className="text-xl font-bold text-slate-900 tracking-tight">Danh sách lịch đã gỡ bỏ</h3>
                       </div>
                       <span className="px-4 py-1.5 bg-red-100 text-red-700 text-[10px] font-black rounded-full border border-red-200 uppercase tracking-widest shadow-sm">Tối đa 10 gần đây</span>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {(() => {
                        if (recentCancelled.length === 0) return (
                          <div className="py-24 text-center bg-white rounded-[40px] border border-slate-100">
                            <p className="text-slate-400 font-bold italic text-lg">Chưa có lịch hẹn nào bị hủy</p>
                          </div>
                        );
                        
                        return recentCancelled.map((app) => (
                          <div key={app.id} className="bg-slate-50/50 p-8 rounded-3xl border border-dashed border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 opacity-80 group hover:opacity-100 transition-all">
                            <div className="flex items-center gap-8">
                              <div className="text-center shrink-0">
                                <span className="text-2xl font-black text-slate-300 tabular-nums">{app.startTime}</span>
                                <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">{app.date}</p>
                              </div>
                              <div className="h-12 w-px bg-slate-200" />
                              <div className="space-y-1">
                                <h4 className="font-bold text-slate-400 line-through text-lg">{app.clientName}</h4>
                                <p className="text-xs text-red-400 font-bold italic">Lý do: {app.cancellationReason || 'Admin hủy'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                               <button 
                                onClick={() => handleRestoreAppointment(app.id)}
                                className="px-6 py-3 bg-yellow-400 text-amber-950 font-black text-[11px] rounded-2xl hover:bg-yellow-300 transition-all shadow-lg uppercase tracking-widest shadow-yellow-200/50"
                               >
                                Khôi phục
                               </button>
                               <button 
                                onClick={async () => { if (confirm("Xóa vĩnh viễn?")) await deleteDoc(doc(db, 'appointments', app.id)); }}
                                className="p-3.5 text-slate-300 hover:text-red-500 bg-white rounded-2xl transition-all border border-slate-200 hover:border-red-200"
                               >
                                <Trash2 size={20} />
                               </button>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </motion.div>
                )}

                {activeAdminTab === 'cvs' && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-yellow-100 rounded-2xl flex items-center justify-center text-yellow-600 shadow-sm border border-yellow-200">
                          <FileText size={24} />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-slate-900 tracking-tight">Quản lý CV Học viên</h3>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tổng: {cvs.length}</span>
                            <span className="w-1 h-1 bg-slate-200 rounded-full" />
                            <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Chờ Duyệt: {cvs.filter(c => c.status === 'pending').length}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={exportCVsToExcel}
                          className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-xl text-xs font-black hover:bg-green-700 transition-all shadow-lg uppercase tracking-widest shadow-green-100"
                        >
                          <Download size={16} />
                          Xuất Excel
                        </button>
                      </div>
                    </div>

                    <div className="flex bg-white p-1 rounded-2xl border border-slate-100 shadow-sm sticky top-[4.5rem] z-10">
                      {[
                        { id: 'all', label: 'Tất cả CV' },
                        { id: 'pending', label: 'Chờ phê duyệt' },
                        { id: 'approved', label: 'Đã phê duyệt' },
                        { id: 'rejected', label: 'Bị từ chối' },
                      ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setCvFilter(tab.id as any)}
                          className={cn(
                            "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                            cvFilter === tab.id 
                              ? "bg-slate-900 text-white shadow-lg" 
                              : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          {tab.label}
                          {tab.id === 'pending' && cvs.filter(c => c.status === 'pending').length > 0 && (
                            <span className="ml-2 bg-orange-500 text-white px-1.5 py-0.5 rounded-md text-[8px]">
                              {cvs.filter(c => c.status === 'pending').length}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {cvs.filter(c => cvFilter === 'all' ? true : c.status === cvFilter).length === 0 ? (
                        <div className="py-24 text-center bg-white rounded-[40px] border border-slate-100">
                          <p className="text-slate-400 font-bold italic text-lg capitalize">
                            {cvFilter === 'all' ? 'Chưa có CV nào được tạo' : 
                             cvFilter === 'pending' ? 'Không có CV nào đang chờ duyệt' : 'Chưa có CV nào được phê duyệt'}
                          </p>
                        </div>
                      ) : (
                        cvs.filter(c => cvFilter === 'all' ? true : c.status === cvFilter).map((cv) => (
                          <div key={cv.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:shadow-md transition-shadow relative overflow-hidden group">
                            {/* Status strip */}
                            <div className={cn(
                              "absolute top-0 left-0 w-1.5 h-full transition-all group-hover:w-2",
                              cv.status === 'approved' ? "bg-green-500" : "bg-orange-400 animate-pulse"
                            )} />
                            
                             <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 pl-2 text-left items-start">
                               <div>
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Học viên</p>
                                 <h4 className="font-bold text-slate-900 text-sm">{cv.fullName} ({cv.age}t)</h4>
                                 <p className="text-sm font-medium text-slate-600 select-all">{cv.phone}</p>
                               </div>
                               <div>
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Hướng dẫn viên</p>
                                 <p className="text-xs font-bold text-blue-600 truncate">{cv.guideName}</p>
                                 <div className="flex items-center gap-2 mt-0.5">
                                   <span className="text-[9px] font-medium text-slate-400 italic">SĐT: ...{cv.guidePhoneLast4}</span>
                                   <span className="w-1 h-1 rounded-full bg-slate-200" />
                                   <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">PIN: {cv.password}</span>
                                 </div>
                               </div>
                               <div>
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">BILL CHUYỂN KHOẢN</p>
                                 {cv.paymentImageUrl ? (
                                   <button 
                                     onClick={() => setSelectedPaymentImage(cv.paymentImageUrl || null)}
                                     className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors border border-blue-100 flex items-center gap-2 shadow-sm w-fit"
                                   >
                                     <ImageIcon size={14} />
                                     <span className="text-[9px] font-black uppercase tracking-wider">Xem ảnh</span>
                                   </button>
                                 ) : (
                                   <p className="text-[10px] font-medium text-slate-400 italic">Không có ảnh</p>
                                 )}
                               </div>
                               
                               <div>
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Người duyệt</p>
                                 {cv.status === 'pending' ? (
                                   <select
                                     className="text-[10px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-400 transition-colors cursor-pointer uppercase tracking-wide"
                                     value={localReviewers[cv.id] || REVIEWERS[0]}
                                     onChange={(e) => setLocalReviewers(prev => ({ ...prev, [cv.id]: e.target.value }))}
                                   >
                                     {REVIEWERS.map(r => (
                                       <option key={r} value={r}>{r}</option>
                                     ))}
                                   </select>
                                 ) : (
                                   <p className="text-[10px] font-bold text-slate-600 uppercase mt-1">{cv.processedBy || 'Chưa rõ'}</p>
                                 )}
                               </div>
                               
                               <div className="flex flex-col gap-2">
                                 <div className="hidden sm:block">
                                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Trạng thái</p>
                                   <div className="flex items-center gap-2">
                                     <p className={cn(
                                       "text-[10px] font-black uppercase tracking-wider",
                                       cv.status === 'approved' ? "text-green-600" : (cv.status === 'rejected' ? "text-red-600" : "text-orange-600")
                                     )}>
                                       {cv.status === 'approved' ? '✓ Đã duyệt' : (cv.status === 'rejected' ? '✕ Từ chối' : '● Chờ duyệt')}
                                     </p>
                                   </div>
                                 </div>
                                 
                                 {cv.status === 'pending' ? (
                                   <div className="flex items-center gap-2">
                                     <button 
                                      onClick={() => handleCVAction(cv.id, 'approve')}
                                      className="p-2 bg-green-50 text-green-600 hover:bg-green-100 rounded-xl transition-all border border-green-100 shadow-sm"
                                      title="Phê duyệt"
                                     >
                                      <Check size={16} strokeWidth={3} />
                                     </button>
                                     <button 
                                      onClick={() => handleCVAction(cv.id, 'reject')}
                                      className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition-all border border-red-100 shadow-sm"
                                      title="Từ chối"
                                     >
                                      <X size={16} strokeWidth={3} />
                                     </button>
                                   </div>
                                 ) : (
                                   <div className="flex items-center gap-2">
                                     <button 
                                      onClick={() => handleCVAction(cv.id, 'restore')}
                                      className="p-2 bg-slate-50 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-slate-100 hover:border-blue-100 shadow-sm"
                                      title="Khôi phục về chờ duyệt"
                                     >
                                      <RotateCcw size={16} strokeWidth={3} />
                                     </button>
                                     {cv.status === 'approved' && (
                                       <button 
                                        onClick={() => handleCVAction(cv.id, 'reject')}
                                        className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition-all border border-red-100 shadow-sm"
                                        title="Từ chối"
                                       >
                                        <X size={16} strokeWidth={3} />
                                       </button>
                                     )}
                                   </div>
                                 )}
                               </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Admin Action Modal (Unified Design) */}
        {cvActionModal.show && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isProcessingAction && setCvActionModal({ ...cvActionModal, show: false })}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-[420px] bg-white rounded-[50px] shadow-2xl overflow-hidden"
            >
              <div className="h-2 bg-yellow-400" />
              
              <div className="p-10 space-y-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-widest">
                    {cvActionModal.type === 'approve' ? 'Phê duyệt' : 
                     cvActionModal.type === 'reject' ? 'Từ chối' : 'Khôi phục'}
                  </h3>
                  <div className="p-2 bg-slate-50 text-slate-300 rounded-xl">
                    <LogIn size={20} />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">MẬT KHẨU ADMIN</label>
                    <input 
                      autoFocus
                      type="password" 
                      placeholder="••••••" 
                      value={adminPinInput}
                      onChange={(e) => setAdminPinInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && confirmCVAction()}
                      className="w-full px-7 py-4 bg-yellow-50/50 border border-transparent focus:border-yellow-200 outline-none rounded-3xl font-black text-slate-800 transition-all placeholder:text-slate-300" 
                    />
                  </div>
                </div>

                <div className="bg-yellow-50 p-4 rounded-3xl border border-yellow-100 flex items-start gap-3">
                  <div className="mt-0.5 text-yellow-600">
                    <AlertCircle size={16} />
                  </div>
                  <p className="text-[10px] text-yellow-700 font-bold leading-relaxed">
                    Lưu ý: Đây là thao tác quản trị hệ thống. Hãy đảm bảo bạn có quyền thực hiện hành động này.
                  </p>
                </div>

                <button 
                  onClick={confirmCVAction}
                  disabled={isProcessingAction || !adminPinInput}
                  className="w-full py-5 bg-yellow-400 text-amber-950 rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-yellow-300 transition-all shadow-xl shadow-yellow-200 active:scale-[0.98] disabled:opacity-50 disabled:grayscale"
                >
                  {isProcessingAction ? 'ĐANG XỬ LÝ...' : 'XÁC NHẬN THỰC HIỆN'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </main>

      {/* CV Modal for Students */}
      <AnimatePresence>
        {/* Payment Image Popup */}
        {selectedPaymentImage && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => setSelectedPaymentImage(null)}
              className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="relative w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                    <ImageIcon size={20} />
                  </div>
                  <h3 className="font-black text-slate-900 uppercase tracking-widest text-sm">Minh chứng chuyển khoản</h3>
                </div>
                <button 
                  onClick={() => setSelectedPaymentImage(null)}
                  className="p-2.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-2xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 bg-slate-50 p-4 min-h-[300px] max-h-[70vh] overflow-y-auto">
                <img 
                  src={selectedPaymentImage} 
                  alt="Payment Evidence" 
                  className="w-full h-auto object-contain rounded-2xl shadow-sm"
                />
              </div>
              <div className="p-6 bg-white border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setSelectedPaymentImage(null)}
                  className="px-8 py-3 bg-slate-900 text-white font-black text-[10px] rounded-2xl uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl"
                >
                  Đóng
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showCVModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-amber-950/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[40px] p-8 max-w-2xl w-full shadow-2xl border border-yellow-200 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">CV Học Viên</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Hồ sơ năng lực cá nhân</p>
                </div>
                <button 
                  onClick={() => {
                    setShowCVModal(false);
                    setFoundCV(null);
                    setCvSearchPIN('');
                    setCvSearchPhoneLast4('');
                  }} 
                  className="p-3 bg-slate-50 text-slate-400 hover:text-slate-600 rounded-2xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex bg-slate-100 p-1 rounded-2xl mb-8">
                {[
                  { id: 'create', label: 'Tạo CV Mới', icon: <Plus size={16} /> },
                  { id: 'search', label: 'Tìm Kiếm CV', icon: <Search size={16} /> },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setCvModalTab(tab.id as any);
                      setFoundCV(null);
                      setCvSearchPIN('');
                      setCvSearchPhoneLast4('');
                    }}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all",
                      cvModalTab === tab.id 
                        ? "bg-white text-slate-900 shadow-sm" 
                        : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {cvModalTab === 'create' ? (
                <form onSubmit={handleCVSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Dán thông tin từ văn bản (Hệ thống tự điền)</label>
                    <textarea 
                      placeholder="Coppy và dán nội dung CV tại đây..." 
                      rows={4}
                      value={cvAutoFillText}
                      onChange={(e) => handleCVAutoFill(e.target.value)}
                      className="w-full px-5 py-3.5 bg-yellow-50 border border-yellow-100 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-medium text-sm resize-none italic" 
                    />
                    <div className="bg-slate-50 p-3 rounded-xl text-[10px] text-slate-500 font-medium leading-relaxed">
                      Hướng dẫn: Dán nội dung theo định dạng "Họ tên...", "Điện thoại..." để tự động điền các trường bên dưới.
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Họ tên học viên *</label>
                      <input required type="text" placeholder="Nguyễn Văn A" 
                        value={cvFormData.fullName} onChange={(e) => setCvFormData({ ...cvFormData, fullName: e.target.value })}
                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm" />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Điện thoại *</label>
                       <input required type="tel" placeholder="090..." 
                        value={cvFormData.phone} onChange={(e) => setCvFormData({ ...cvFormData, phone: e.target.value })}
                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Tuổi *</label>
                      <input required type="text" placeholder="25" 
                        value={cvFormData.age} onChange={(e) => setCvFormData({ ...cvFormData, age: e.target.value })}
                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Địa Chi</label>
                      <input type="text" placeholder="Hà Nội..." 
                        value={cvFormData.address} onChange={(e) => setCvFormData({ ...cvFormData, address: e.target.value })}
                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Công Việc</label>
                    <input type="text" placeholder="Nhân viên văn phòng..." 
                      value={cvFormData.job} onChange={(e) => setCvFormData({ ...cvFormData, job: e.target.value })}
                      className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Mong muốn</label>
                    <textarea placeholder="Bạn mong muốn điều gì sau khóa học?" rows={3}
                      value={cvFormData.target} onChange={(e) => setCvFormData({ ...cvFormData, target: e.target.value })}
                      className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm resize-none" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Tên hướng dẫn viên *</label>
                       <input required type="text" placeholder="Tên người hướng dẫn..." 
                        value={cvFormData.guideName} onChange={(e) => setCvFormData({ ...cvFormData, guideName: e.target.value })}
                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm" />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">4 số cuối SĐT của HDV *</label>
                       <input required type="text" maxLength={4} placeholder="Ví dụ: 1234" 
                        value={cvFormData.guidePhoneLast4} onChange={(e) => setCvFormData({ ...cvFormData, guidePhoneLast4: e.target.value })}
                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Mã PIN bảo mật CV (Để tìm kiếm sau này)</label>
                    <input required type="password" placeholder="Tối thiểu 4 ký tự" 
                      value={cvFormData.password} onChange={(e) => setCvFormData({ ...cvFormData, password: e.target.value })}
                      className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-black text-sm tracking-widest" />
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Ảnh chuyển khoản thành công *</label>
                    <div 
                      onClick={() => document.getElementById('payment-upload')?.click()}
                      className={cn(
                        "w-full aspect-video rounded-3xl border-2 border-dashed flex flex-col items-center justify-center gap-3 cursor-pointer transition-all overflow-hidden relative group",
                        cvFormData.paymentImageUrl ? "border-green-400 bg-green-50" : "border-slate-200 bg-slate-50 hover:border-yellow-400 hover:bg-yellow-50"
                      )}
                    >
                      {cvFormData.paymentImageUrl ? (
                        <>
                          <img src={cvFormData.paymentImageUrl} alt="Payment" className="w-full h-full object-contain" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <p className="text-white text-[10px] font-black uppercase tracking-widest">Thay đổi ảnh</p>
                          </div>
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCvFormData(prev => ({ ...prev, paymentImageUrl: '' }));
                            }}
                            className="absolute top-4 right-4 p-2 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 shadow-sm border border-slate-100 group-hover:text-yellow-500 group-hover:scale-110 transition-all">
                            <Upload size={20} />
                          </div>
                          <div className="text-center">
                            <p className="text-xs font-bold text-slate-600">Bấm để tải ảnh chuyển khoản</p>
                            <p className="text-[9px] font-medium text-slate-400 mt-1 uppercase tracking-tight">Kích thước phim dưới 1MB</p>
                          </div>
                        </>
                      )}
                    </div>
                    <input 
                      id="payment-upload" 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleImageUpload}
                    />
                    {cvFormData.paymentImageUrl && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-green-100/50 rounded-xl text-[9px] font-bold text-green-700">
                        <CheckCircle2 size={12} />
                        <span>Đã tải lên ảnh minh chứng thành công</span>
                      </div>
                    )}
                  </div>
                  
                  <button type="submit" disabled={isSubmittingCV}
                    className="w-full py-4 bg-amber-950 text-yellow-400 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all active:scale-95 disabled:opacity-50">
                    {isSubmittingCV ? 'Đang lưu...' : 'Lưu Hồ Sơ CV'}
                  </button>
                </form>
              ) : (
                <div className="space-y-8">
                  <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 text-[10px] text-blue-600 font-bold text-center leading-relaxed mb-4">
                      Vui lòng nhập đúng 4 số cuối số điện thoại và mã PIN bạn đã tạo khi nộp hồ sơ để xem trạng thái.
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">4 số cuối SĐT của bạn</label>
                        <input 
                          type="text" 
                          maxLength={4}
                          placeholder="Ví dụ: 1234" 
                          value={cvSearchPhoneLast4} 
                          onChange={(e) => setCvSearchPhoneLast4(e.target.value)}
                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-black text-sm tracking-widest text-center" 
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Mã PIN CV</label>
                        <input 
                          type="password" 
                          placeholder="Nhập mã PIN của bạn" 
                          value={cvSearchPIN} 
                          onChange={(e) => setCvSearchPIN(e.target.value)}
                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-black text-sm tracking-widest text-center" 
                        />
                      </div>
                    </div>

                    <button onClick={handleCVSearch} disabled={isSearchingCV}
                      className="w-full py-4 bg-yellow-400 text-amber-950 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-yellow-300 transition-all shadow-lg active:scale-95 disabled:opacity-50">
                      {isSearchingCV ? 'Đang tìm kiếm...' : 'Kiểm tra trạng thái hồ sơ'}
                    </button>
                  </div>

                  {foundCV && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      className="p-8 bg-yellow-50 rounded-3xl border border-yellow-200 space-y-6">
                      <div className="flex items-center justify-between border-b border-yellow-200 pb-4">
                        <h4 className="text-xl font-black text-slate-900 tracking-tight">{foundCV.fullName}</h4>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest",
                            foundCV.status === 'approved' ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700 animate-pulse"
                          )}>
                            {foundCV.status === 'approved' ? 'Đã phê duyệt' : 'Chờ phê duyệt'}
                          </span>
                          <button 
                            onClick={() => exportSingleCV(foundCV)}
                            className="p-2 bg-white text-green-600 rounded-lg hover:bg-green-50 transition-colors shadow-sm border border-green-100"
                            title="Tải CV Excel"
                          >
                            <Download size={14} />
                          </button>
                        </div>
                      </div>
                      
                      {foundCV.status !== 'approved' && (
                        <div className="bg-orange-50 border border-orange-100 p-3 rounded-xl text-[10px] text-orange-600 font-bold flex items-center gap-2">
                          <Clock size={12} />
                          <span>Hồ sơ của bạn đang chờ quản trị viên kiểm tra và phê duyệt.</span>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Học viên</p>
                          <p className="text-xs font-bold text-slate-700">{foundCV.age} tuổi</p>
                          <p className="text-xs font-medium text-slate-500">{foundCV.job}</p>
                          <p className="text-xs font-medium text-slate-500 truncate">{foundCV.address}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Liên hệ</p>
                          <p className="text-xs font-bold text-slate-700">{foundCV.phone}</p>
                        </div>
                        <div className="col-span-2 pt-2 border-t border-yellow-100">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Hướng dẫn viên</p>
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-slate-700">{foundCV.guideName}</p>
                            <p className="text-[10px] font-black text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-lg">SĐT: ...{foundCV.guidePhoneLast4}</p>
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Mong muốn</p>
                        <p className="text-xs text-slate-800 leading-relaxed font-medium bg-white/50 p-4 rounded-xl border border-white/50 italic">{foundCV.target}</p>
                      </div>

                      {foundCV.paymentImageUrl && (
                        <div className="space-y-3">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Minh chứng chuyển khoản</p>
                          <div className="rounded-2xl overflow-hidden border border-yellow-200 bg-white">
                            <img src={foundCV.paymentImageUrl} alt="Chuyển khoản" className="w-full h-auto max-h-64 object-contain" />
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                <div>
                  <h2 className="text-xl font-bold text-slate-900 leading-tight">
                    {manageAppointment.status === 'cancelled' ? 'Khôi phục lịch hẹn' : 'Quản lý lịch hẹn'}
                  </h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    {manageAppointment.status === 'cancelled' ? 'Dành cho Quản trị viên' : 'Dành cho Người đặt & Admin'}
                  </p>
                </div>
                <button onClick={() => { setShowManageModal(false); setManagePassword(''); }} className="p-2 bg-slate-50 text-slate-400 hover:text-slate-600 rounded-full transition-colors">
                  <ChevronRight size={20} className="rotate-45" />
                </button>
              </div>

              <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-100 space-y-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Chi tiết</p>
                <p className="text-sm font-semibold text-slate-700">{manageAppointment.date} Lúc {manageAppointment.startTime}</p>
                <div className="pt-2 border-t border-slate-200/50 mt-2 space-y-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Học viên</p>
                  <p className="text-sm text-slate-600">{manageAppointment.clientName}</p>
                  
                  {manageAppointment.status === 'cancelled' && (
                    <div className="bg-red-50 p-2 rounded-lg border border-red-100 mt-2">
                      <p className="text-[10px] text-red-400 font-bold uppercase">Trạng thái: Bận đột xuất / Đã hủy</p>
                      <p className="text-xs text-red-600 italic font-medium">Lý do: {manageAppointment.cancellationReason || 'Không rõ lý do'}</p>
                    </div>
                  )}

                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">Hướng dẫn viên</p>
                  <p className="text-sm text-slate-600">{manageAppointment.guide}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">Câu hỏi</p>
                  <p className="text-sm text-slate-600 italic">"{manageAppointment.question}"</p>
                </div>
              </div>

              <div className="space-y-5">
                {manageAppointment.status === 'active' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between ml-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        Xác minh bằng Mã PIN bạn đã tạo
                      </label>
                      {isAdmin && (
                        <span className="text-[9px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100 uppercase tracking-tighter">
                          Quyền Admin
                        </span>
                      )}
                    </div>
                    
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                        <Lock size={14} />
                      </div>
                      <input 
                        type="text" 
                        inputMode="numeric"
                        value={managePassword}
                        onChange={e => setManagePassword(e.target.value)}
                        placeholder={isAdmin ? "Đã xác minh Quyền Admin" : "Nhập Mã PIN đã tạo..."}
                        disabled={isAdmin}
                        className={cn(
                          "w-full pl-10 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:border-yellow-400 focus:bg-white transition-all outline-none text-sm font-bold tracking-widest placeholder:tracking-normal placeholder:font-medium",
                          isAdmin && "opacity-60 border-slate-100 bg-slate-50/50 cursor-not-allowed"
                        )}
                      />
                    </div>
                  </div>
                )}

                {isAdmin && manageAppointment.status === 'active' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-2xl border border-yellow-100 cursor-pointer transition-all hover:bg-yellow-100/50" onClick={() => setIsSuddenCancel(!isSuddenCancel)}>
                      <div className={cn(
                        "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                        isSuddenCancel ? "bg-amber-950 border-amber-950 text-white" : "bg-white border-slate-300"
                      )}>
                        {isSuddenCancel && <CheckCircle2 size={14} />}
                      </div>
                      <div className="flex-1">
                        <p className="text-[11px] font-black text-amber-950 uppercase tracking-tight">Hủy lịch đột xuất</p>
                        <p className="text-[9px] text-amber-800 font-medium tracking-tight">Khung giờ này sẽ bị khóa và hiển thị "Bận đột xuất"</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 inline-flex items-center gap-1.5">
                        <MessageSquare size={12} className="text-yellow-600" />
                        Lý do hủy {isSuddenCancel ? 'đột xuất' : ''}
                      </label>
                      <textarea 
                        rows={3}
                        value={adminReason}
                        onChange={e => setAdminReason(e.target.value)}
                        placeholder={isSuddenCancel ? "Nhập lý do (vd: Có việc bận đột xuất...)" : "Nhập lý do (vd: Thông tin Học viên không chính xác...)"}
                        className="w-full px-4 py-3 bg-red-50/30 border border-red-100 rounded-2xl focus:ring-2 focus:ring-red-400 focus:bg-white transition-all outline-none text-sm font-medium placeholder:text-slate-300 resize-none italic"
                      />
                    </div>
                  </div>
                )}
                
                <div className="flex gap-3 pt-2">
                  {manageAppointment.status === 'active' ? (
                    <button 
                      onClick={() => handleCancelAppointment(false)}
                      disabled={isManaging || (!isAdmin && !managePassword)}
                      className={cn(
                        "flex-1 py-4 bg-red-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-red-200 hover:bg-red-600 transition-all active:scale-[0.98] disabled:opacity-40",
                        isAdmin && "bg-amber-950 shadow-amber-950/20"
                      )}
                    >
                      {isManaging ? 'Đang hửy...' : isAdmin ? 'Hủy lịch (Lưu lại)' : 'Xác nhận hủy lịch'}
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleRestoreAppointment()}
                      disabled={isManaging || !isAdmin}
                      className="flex-1 py-4 bg-yellow-400 text-amber-950 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-yellow-200 hover:bg-yellow-300 transition-all active:scale-[0.98] disabled:opacity-40"
                    >
                      {isManaging ? 'Đang khôi phục...' : 'Khôi phục lịch hẹn'}
                    </button>
                  )}
                  
                  {isAdmin && (
                    <button 
                      onClick={() => {
                        if (confirm("Xóa vĩnh viễn dữ liệu này? Hành động không thể hoàn tác.")) {
                          handleCancelAppointment(true);
                        }
                      }}
                      disabled={isManaging}
                      className="w-14 items-center justify-center flex bg-red-600 text-white rounded-2xl font-bold shadow-xl shadow-red-900/20 hover:bg-red-700 transition-all active:scale-[0.98]"
                      title="Xóa vĩnh viễn"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
                </div>
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

      {/* Booking Modal Overlay */}
      <AnimatePresence>
        {showBookingModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-amber-950/60 backdrop-blur-md overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 30 }}
              className="bg-white rounded-[40px] p-8 lg:p-12 max-w-2xl w-full shadow-2xl border border-yellow-200 relative my-auto"
            >
              <button 
                onClick={() => { setShowBookingModal(false); setSelectedSlot(null); }}
                className="absolute top-8 right-8 p-3 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-2xl transition-all"
              >
                <X size={24} />
              </button>

              <div className="mb-10 text-center">
                <div className="inline-flex items-center gap-4 bg-yellow-50 px-6 py-2 rounded-full border border-yellow-100 mb-4">
                  <Clock size={16} className="text-yellow-600" />
                  <span className="text-xs font-black text-yellow-700 uppercase tracking-widest">ĐANG ĐẶT CHỖ LÚC {selectedSlot}</span>
                </div>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">THÔNG TIN KẾT NỐI</h3>
                <p className="text-sm text-slate-400 font-medium italic mt-1">Vui lòng điền đầy đủ các thông tin bên dưới</p>
              </div>

              <form onSubmit={handleBooking} className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Tên Học viên</label>
                  <input 
                    required
                    type="text" 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="Nhập tên..."
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-yellow-400 focus:bg-white transition-all outline-none text-base font-bold placeholder:text-slate-300 shadow-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Hướng dẫn viên</label>
                  <input 
                    required
                    type="text" 
                    value={formData.guide}
                    onChange={e => setFormData({...formData, guide: e.target.value})}
                    placeholder="Ví dụ: Sư Huynh"
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-yellow-400 focus:bg-white transition-all outline-none text-base font-bold placeholder:text-slate-300 shadow-sm"
                  />
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Vấn đề cần hỗ trợ</label>
                  <textarea 
                    required
                    rows={3}
                    value={formData.question}
                    onChange={e => setFormData({...formData, question: e.target.value})}
                    placeholder="Bạn muốn trao đổi về điều gì?"
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-yellow-400 focus:bg-white transition-all outline-none text-base font-bold placeholder:text-slate-300 resize-none shadow-sm"
                  />
                </div>

                <div className="md:col-span-2 space-y-2">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Mật khẩu hủy lịch</label>
                    <span className="text-[9px] text-yellow-600 font-bold uppercase tracking-widest">(Ghi nhớ để tự hủy khi cần)</span>
                  </div>
                  <input 
                    required
                    type="text" 
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    placeholder="Nhập 4 số..."
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-yellow-400 focus:bg-white transition-all outline-none text-base font-bold tracking-widest placeholder:tracking-normal placeholder:text-slate-300 shadow-sm"
                  />
                </div>

                <div className="md:col-span-2 pt-6">
                  <button 
                    disabled={isBooking}
                    className="w-full py-5 bg-yellow-400 text-amber-950 rounded-2xl text-lg font-black shadow-xl shadow-yellow-100 hover:bg-yellow-300 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
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
                  <button 
                    type="button"
                    onClick={() => { setShowBookingModal(false); setSelectedSlot(null); }}
                    className="w-full mt-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] hover:text-slate-600 transition-colors"
                  >
                    BỎ QUA & QUAY LẠI
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Date Picker Modal */}
      <AnimatePresence>
        {showCalendarPicker && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[40px] p-10 max-w-md w-full shadow-2xl border border-yellow-200"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black text-slate-900 uppercase">Chọn ngày kết nối</h3>
                <button onClick={() => setShowCalendarPicker(false)} className="p-2 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-xl">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between bg-slate-50 p-4 rounded-3xl">
                  <button onClick={() => setCurrentMonth(addMonths(currentMonth, -1))} className="p-2 hover:bg-white rounded-xl text-slate-400 shadow-sm transition-all">
                    <ChevronLeft size={20} />
                  </button>
                  <span className="font-black text-sm text-slate-700 uppercase tracking-widest">
                    {format(currentMonth, 'MMMM yyyy', { locale: vi })}
                  </span>
                  <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-white rounded-xl text-slate-400 shadow-sm transition-all">
                    <ChevronRight size={20} />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => (
                    <div key={d} className="text-center text-[10px] font-black text-slate-300 uppercase py-2">{d}</div>
                  ))}
                  {(() => {
                    const start = startOfMonth(currentMonth);
                    const end = endOfMonth(currentMonth);
                    const today = startOfDay(new Date());
                    const days = eachDayOfInterval({ start, end });
                    const firstDayIdx = (getDay(start) + 6) % 7;
                    
                    const blanks = Array(firstDayIdx).fill(null);
                    return [...blanks, ...days].map((day, i) => {
                      if (!day) return <div key={`blank-${i}`} />;
                      
                      const isSelected = isSameDay(day, selectedDate);
                      const isTodayDate = isSameDay(day, new Date());
                      const isPastDay = isBefore(day, today);

                      return (
                        <button
                          key={i}
                          onClick={() => {
                            setSelectedDate(day);
                            setShowCalendarPicker(false);
                            setSelectedSlot(null);
                            setCurrentMonth(startOfMonth(day));
                          }}
                          className={cn(
                            "h-10 rounded-xl flex items-center justify-center text-xs font-bold transition-all relative overflow-hidden",
                            isSelected 
                              ? "bg-yellow-400 text-amber-950 shadow-lg shadow-yellow-100 z-10 scale-110" 
                              : isTodayDate
                                ? "bg-slate-50 text-yellow-600 border-2 border-yellow-400"
                                : isPastDay
                                  ? "text-slate-300 hover:bg-slate-50"
                                  : "text-slate-600 hover:bg-yellow-50 hover:text-yellow-700"
                          )}
                        >
                          {format(day, 'd')}
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>

              <div className="mt-10">
                <button 
                  onClick={() => {
                    const today = new Date();
                    setSelectedDate(startOfDay(today));
                    setCurrentMonth(startOfMonth(today));
                    setShowCalendarPicker(false);
                    setSelectedSlot(null);
                  }}
                  className="w-full py-4 bg-slate-50 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-yellow-50 hover:text-yellow-700 transition-all"
                >
                  Quay về hôm nay
                </button>
              </div>
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
