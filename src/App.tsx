/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { GoogleGenAI } from "@google/genai";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
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
  getDate,
} from "date-fns";
import { vi } from "date-fns/locale";
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
  Smile,
  Frown,
  FileText,
  Download,
  Search,
  Image as ImageIcon,
  Upload,
  Eye,
  Smartphone,
  MousePointerClick,
  GraduationCap,
  List,
  CircleDollarSign,
  Copy,
  ShieldAlert,
  ChevronDown,
  SlidersHorizontal,
  ArrowLeft,
  Sparkles,
  RefreshCw,
  BookOpen,
  ArrowDownToLine,
} from "lucide-react";
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
  FirestoreError,
  arrayRemove,
} from "firebase/firestore";
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import { db, auth, googleProvider } from "./lib/firebase";
import { cn } from "./lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { handleFirestoreError } from "./services/errorService";

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
  status: "active" | "cancelled";
  password: string;
  createdAt: any;
  cancellationReason?: string;
  cancelledByAdmin?: boolean;
}

interface Course {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  closingDate: string;
  studentIds: string[];
  createdAt: any;
  companions?: string[];
  studyGroups?: string[];
  tracking?: Record<string, any>;
  removedStudentIds?: string[];
  autoAddFromDate?: string;
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
  status: "pending" | "approved" | "rejected";
  phoneLast4: string;
  paymentImageUrl?: string;
  createdAt: any;
  processedAt?: any;
  processedBy?: string;
  appApproved?: boolean;
  appApprovedBy?: string;
  appApprovedAt?: any;
  appRejectedReason?: string;
  companion?: string;
  studentId?: string;
  studyGroup?: string;
  previousCourse?: string;
  type?: "reenroll";
}

// --- Constants ---
const REVIEWERS = ["Đức Toàn", "Thành Công", "Ngọc Ánh"];
const SLOT_DURATION = 30; // minutes

export const getColorForString = (str: string) => {
  if (
    !str ||
    str.toLowerCase() === "chưa có" ||
    str.toLowerCase() === "chưa nhóm" ||
    str === "Chưa có Người đồng hành"
  )
    return "bg-slate-100 text-slate-600 border-slate-200";

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const colors = [
    "bg-red-50 text-red-700 border-red-200",
    "bg-orange-50 text-orange-700 border-orange-200",
    "bg-amber-50 text-amber-700 border-amber-200",
    "bg-green-50 text-green-700 border-green-200",
    "bg-emerald-50 text-emerald-700 border-emerald-200",
    "bg-teal-50 text-teal-700 border-teal-200",
    "bg-cyan-50 text-cyan-700 border-cyan-200",
    "bg-sky-50 text-sky-700 border-sky-200",
    "bg-blue-50 text-blue-700 border-blue-200",
    "bg-indigo-50 text-indigo-700 border-indigo-200",
    "bg-violet-50 text-violet-700 border-violet-200",
    "bg-purple-50 text-purple-700 border-purple-200",
    "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
    "bg-pink-50 text-pink-700 border-pink-200",
    "bg-rose-50 text-rose-700 border-rose-200",
  ];

  return colors[Math.abs(hash) % colors.length];
};

export default function App() {
  const [selectedDate, setSelectedDate] = useState<Date>(
    startOfDay(new Date()),
  );
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [recentCancelled, setRecentCancelled] = useState<Appointment[]>([]);
  const [lockedSlots, setLockedSlots] = useState<
    { id: string; date: string; startTime: string }[]
  >([]);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isFirebaseAdmin, setIsFirebaseAdmin] = useState(false);
  const [isStaticAdmin, setIsStaticAdmin] = useState(
    () => localStorage.getItem("isStaticAdmin") === "true",
  );
  const [view, setView] = useState<"booking" | "admin">("booking");
  const [isBooking, setIsBooking] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    guide: "",
    question: "",
    password: "",
  });
  const [slotDuration, setSlotDuration] = useState(30);
  const [businessHours, setBusinessHours] = useState([
    { label: "Sáng", start: 8, end: 12 },
    { label: "Chiều", start: 12, end: 22 },
  ]);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [currentDayConfig, setCurrentDayConfig] = useState<DayConfig | null>(
    null,
  );
  const [editingDayConfig, setEditingDayConfig] =
    useState<Partial<DayConfig> | null>(null);
  const [allDayConfigs, setAllDayConfigs] = useState<{
    [key: string]: DayConfig;
  }>({});
  const [announcement, setAnnouncement] = useState("");
  const [isAdminMessageVisible, setIsAdminMessageVisible] = useState(true);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<Date>(
    startOfMonth(new Date()),
  );
  const [activeAdminTab, setActiveAdminTab] = useState<
    "config" | "appointments" | "cancelled" | "cvs"
  >("appointments");
  const [cvFilter, setCvFilter] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("all");
  const [selectedPaymentImage, setSelectedPaymentImage] = useState<
    string | null
  >(null);
  const [selectedAppCvIds, setSelectedAppCvIds] = useState<string[]>([]);
  const [isAppApprovalMode, setIsAppApprovalMode] = useState(false);
  const [selectedDeleteCvIds, setSelectedDeleteCvIds] = useState<string[]>([]);
  const [isDeleteCvMode, setIsDeleteCvMode] = useState(false);
  const [appRejectReasonInput, setAppRejectReasonInput] = useState("");
  const [cvs, setCvs] = useState<CV[]>([]);
  const [showCVModal, setShowCVModal] = useState(false);
  const [editingCvId, setEditingCvId] = useState<string | null>(null);
  const [cvModalTab, setCvModalTab] = useState<
    "search" | "create" | "reenroll"
  >("create");
  const [cvSearchPIN, setCvSearchPIN] = useState("");
  const [cvSearchPhoneLast4, setCvSearchPhoneLast4] = useState("");
  const [foundCVs, setFoundCVs] = useState<CV[]>([]);
  const [isSearchingCV, setIsSearchingCV] = useState(false);
  const [isSubmittingCV, setIsSubmittingCV] = useState(false);
  const [showCVSaveSuccess, setShowCVSaveSuccess] = useState(false);
  const [chromeAlert, setChromeAlert] = useState<string | null>(null);
  const [trackingFilters, setTrackingFilters] = useState<
    Record<string, string>
  >({
    companion: "",
    studentId: "",
    fullName: "",
    age: "",
    guideName: "",
    studyGroup: "",
    facebook: "",
  });
  const [cvFormData, setCvFormData] = useState({
    fullName: "",
    phone: "",
    age: "",
    address: "",
    job: "",
    target: "",
    guideName: "",
    guidePhoneLast4: "",
    password: "",
    paymentImageUrl: "",
    previousCourse: "",
  });
  const [rolePasswords, setRolePasswords] = useState({
    accountant: "",
    app_approver: "",
    delete: "",
    learning: "",
  });
  const [dbRolePasswords, setDbRolePasswords] = useState({
    accountant: "1111",
    app_approver: "2222",
    delete: "6868",
    learning: "123456",
  });
  const [configTab, setConfigTab] = useState<"schedule" | "passwords">(
    "schedule",
  );
  const [adminSetupPassword, setAdminSetupPassword] = useState("");
  const [editingPasswords, setEditingPasswords] = useState({
    accountant: "",
    app_approver: "",
    delete: "",
    learning: "",
  });
  const [unlockedRoles, setUnlockedRoles] = useState({
    accountant: false,
    app_approver: false,
    delete: false,
    learning: false,
  });
  const [adminCvTab, setAdminCvTab] = useState<
    "status" | "accountant" | "app_approver" | "delete" | "learning"
  >("status");
  const [statusSubFilter, setStatusSubFilter] = useState<
    "all" | "pending" | "processing" | "completed" | "rejected"
  >("all");
  const [cvListViewMode, setCvListViewMode] = useState<
    "by_date" | "prioritized"
  >("by_date");
  const [isViewModeMenuOpen, setIsViewModeMenuOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isApprovalMenuOpen, setIsApprovalMenuOpen] = useState(false);
  const [showCvTemplateModal, setShowCvTemplateModal] = useState(false);
  const [showCreateCourseModal, setShowCreateCourseModal] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [courseForm, setCourseForm] = useState({
    name: "",
    start: "",
    end: "",
    closingDate: "",
    autoAddFromDate: "",
  });
  const [selectedLearningCvIds, setSelectedLearningCvIds] = useState<string[]>(
    [],
  );
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [courseSearchText, setCourseSearchText] = useState("");
  const [adminCvSearchText, setAdminCvSearchText] = useState("");
  const [isAdminCvSearchVisible, setIsAdminCvSearchVisible] = useState(false);
  const [courseDetailTab, setCourseDetailTab] = useState<
    "companion" | "group" | "tracking" | "analytics"
  >("companion");
  const [assignFilter, setAssignFilter] = useState<string>("all");
  const [selectedStudentIdsForAssign, setSelectedStudentIdsForAssign] =
    useState<string[]>([]);
  const [trackingStampHoc, setTrackingStampHoc] = useState<boolean | null>(
    true,
  );
  const [trackingStampHanh, setTrackingStampHanh] = useState<string>("⭐");
  const [isEditingTracking, setIsEditingTracking] = useState(false);
  const [isTrackingFilterVisible, setIsTrackingFilterVisible] = useState(false);
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  const [tableZoom, setTableZoom] = useState(100);
  const [isCustomizingTable, setIsCustomizingTable] = useState(false);
  const [tableColumnConfig, setTableColumnConfig] = useState<
    Record<string, { fixed: boolean; hidden: boolean }>
  >({
    stt: { fixed: true, hidden: false },
    companion: { fixed: true, hidden: false },
    studentId: { fixed: true, hidden: false },
    fullName: { fixed: true, hidden: false },
    age: { fixed: false, hidden: false },
    guideName: { fixed: false, hidden: false },
    studyGroup: { fixed: false, hidden: false },
    fbLink: { fixed: false, hidden: false },
  });
  const [activeColumnMenu, setActiveColumnMenu] = useState<string | null>(null);
  const [activeFilterMenu, setActiveFilterMenu] = useState<string | null>(null);
  const [isHeaderFixed, setIsHeaderFixed] = useState(true);
  const [activeTotalMenu, setActiveTotalMenu] = useState<{
    lessonId: string;
    type: "hoc" | "hanh";
  } | null>(null);
  const [trackingHistory, setTrackingHistory] = useState<any[]>([]);

  const [bulkAssignInput, setBulkAssignInput] = useState("");
  const [newEntityName, setNewEntityName] = useState("");
  const [aiAnalysisResult, setAiAnalysisResult] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveColumnMenu(null);
      setActiveTotalMenu(null);
      setActiveFilterMenu(null);
    };
    document.addEventListener("click", handleGlobalClick);
    return () => document.removeEventListener("click", handleGlobalClick);
  }, []);

  const columnsDef = [
    { id: "stt", width: 40, label: "STT" },
    { id: "companion", width: 140, label: "NGƯỜI ĐỒNG HÀNH" },
    { id: "studentId", width: 80, label: "MÃ HỌC VIÊN" },
    { id: "fullName", width: 160, label: "HỌ TÊN" },
    { id: "age", width: 60, label: "TUỔI" },
    { id: "guideName", width: "max-content", label: "HDV" },
    { id: "studyGroup", width: 100, label: "GROUP HỌC TẬP" },
    { id: "fbLink", width: 100, label: "FACEBOOK" },
  ];

  const getColumnStyle = (
    colId: string,
    isHeader: boolean = false,
  ): React.CSSProperties => {
    const colDef = columnsDef.find((c) => c.id === colId);
    const width = colDef ? colDef.width : "auto";

    if (tableColumnConfig[colId]?.hidden) return { display: "none" };

    const widthVal = typeof width === "number" ? `${width}px` : width;

    const baseStyle: any = {
      width: widthVal,
      minWidth: widthVal,
      maxWidth: widthVal,
    };

    if (isHeader) {
      baseStyle.position = isHeaderFixed ? "sticky" : "static";
      baseStyle.top = isHeaderFixed ? 0 : "auto";
      baseStyle.zIndex = 35;
    }

    if (!tableColumnConfig[colId]?.fixed) return baseStyle;

    let left = 0;
    for (const col of columnsDef) {
      if (col.id === colId) break;
      if (
        tableColumnConfig[col.id]?.fixed &&
        !tableColumnConfig[col.id]?.hidden
      ) {
        left += col.width;
      }
    }
    return {
      ...baseStyle,
      left: `${left}px`,
      position: "sticky",
      zIndex: isHeader ? (isHeaderFixed ? 45 : 30) : 25,
    };
  };

  const getColumnClass = (colId: string, customClass: string) => {
    if (tableColumnConfig[colId]?.hidden) return "hidden";
    return cn(
      customClass,
      tableColumnConfig[colId]?.fixed ? "shadow-[1px_0_0_#E2E8F0]" : "",
    );
  };

  const renderColumnMenu = (colId: string) => {
    if (!isCustomizingTable) return null;
    const isMenuOpen = activeColumnMenu === colId;
    const isFixed = tableColumnConfig[colId]?.fixed;
    return (
      <div className="relative inline-block ml-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setActiveColumnMenu(isMenuOpen ? null : colId);
          }}
          className="text-slate-500 hover:text-slate-800 focus:outline-none bg-white/50 rounded"
        >
          <ChevronDown size={14} />
        </button>
        {isMenuOpen && (
          <div className="absolute top-full left-0 mt-1 w-[130px] bg-white border border-slate-200 rounded-lg shadow-lg z-[90] py-1 text-left font-normal normal-case text-[11px] font-sans">
            <button
              className="w-full px-3 py-1.5 text-slate-700 hover:bg-slate-100 flex items-center gap-2"
              onClick={(e) => {
                e.stopPropagation();
                setTableColumnConfig((prev) => ({
                  ...prev,
                  [colId]: { ...prev[colId], fixed: !isFixed },
                }));
                setActiveColumnMenu(null);
              }}
            >
              {isFixed ? "Bỏ cố định cột" : "Cố định cột"}
            </button>
            <button
              className="w-full px-3 py-1.5 text-slate-700 hover:bg-slate-100 flex items-center gap-2"
              onClick={(e) => {
                e.stopPropagation();
                setIsHeaderFixed(!isHeaderFixed);
                setActiveColumnMenu(null);
              }}
            >
              {isHeaderFixed ? "Bỏ cố định hàng" : "Cố định hàng"}
            </button>
            <button
              className="w-full px-3 py-1.5 text-red-600 hover:bg-red-50 flex items-center gap-2"
              onClick={(e) => {
                e.stopPropagation();
                setTableColumnConfig((prev) => ({
                  ...prev,
                  [colId]: { ...prev[colId], hidden: true },
                }));
                setActiveColumnMenu(null);
              }}
            >
              Ẩn cột
            </button>
          </div>
        )}
      </div>
    );
  };

  const handleCopyTemplate = async () => {
    const cvTemplate = `CV - ĐĂNG KÝ HỌC TẬP\n........................................\n1. Họ tên:\n2. Điện thoại:\n3. Tuổi:\n4. Địa Chỉ:\n5. Công Việc:\n6. Mong muốn:`;
    try {
      await navigator.clipboard.writeText(cvTemplate);
      setChromeAlert("Đã sao chép mẫu CV!");
      setShowCvTemplateModal(false);
    } catch (err) {
      setChromeAlert("Không thể sao chép. Vui lòng copy thủ công.");
    }
  };

  const [cvAutoFillText, setCvAutoFillText] = useState("");
  const [now, setNow] = useState(new Date());
  const [overviewTab, setOverviewTab] = useState<"active" | "past" | "empty">(
    "active",
  );
  const [localReviewers, setLocalReviewers] = useState<Record<string, string>>(
    {},
  );
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [cvActionModal, setCvActionModal] = useState<{
    show: boolean;
    cvId: string;
    type:
      | "approve"
      | "reject"
      | "restore"
      | "approveApp"
      | "bulkApproveApp"
      | "bulkRejectApp"
      | "enableAppApprovalMode"
      | "enableDeleteCvMode"
      | "bulkDeleteCv"
      | null;
  }>({ show: false, cvId: "", type: null });
  const [adminPinInput, setAdminPinInput] = useState("");
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const hasAutoSwitchedRef = useRef(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  }>({ show: false, message: "", onConfirm: () => {}, onCancel: () => {} });

  const [passwordPromptDialog, setPasswordPromptDialog] = useState<{
    show: boolean;
    message: string;
    onConfirm: (password: string) => void;
    onCancel: () => void;
  }>({ show: false, message: "", onConfirm: () => {}, onCancel: () => {} });
  const [passwordPromptInput, setPasswordPromptInput] = useState("");

  const customPasswordPrompt = (message: string): Promise<string | null> => {
    setPasswordPromptInput("");
    return new Promise((resolve) => {
      setPasswordPromptDialog({
        show: true,
        message,
        onConfirm: (password) => {
          setPasswordPromptDialog((prev) => ({ ...prev, show: false }));
          resolve(password);
        },
        onCancel: () => {
          setPasswordPromptDialog((prev) => ({ ...prev, show: false }));
          resolve(null);
        },
      });
    });
  };

  const customConfirm = (message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmDialog({
        show: true,
        message,
        onConfirm: () => {
          setConfirmDialog((prev) => ({ ...prev, show: false }));
          resolve(true);
        },
        onCancel: () => {
          setConfirmDialog((prev) => ({ ...prev, show: false }));
          resolve(false);
        },
      });
    });
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10000); // update every 10 seconds for smoothness
    return () => clearInterval(timer);
  }, []);

  const isAdmin = isFirebaseAdmin || isStaticAdmin;

  const updateDayConfig = async (updates: Partial<DayConfig>) => {
    if (!isAdmin) return;
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const configRef = doc(db, "dayConfigs", dateStr);

    const baseConfig = editingDayConfig || {
      morningActive: true,
      afternoonActive: true,
      duration: slotDuration,
      businessHours: businessHours,
    };

    const newConfig = {
      ...baseConfig,
      ...updates,
      date: dateStr,
      password: "123456",
    };
    try {
      await setDoc(configRef, newConfig, { merge: true });
    } catch (err) {
      console.error("Day config error:", err);
      handleFirestoreError(err, "write", configRef.path);
    }
  };

  const updateSettings = async (updates: any) => {
    setIsUpdatingSettings(true);
    try {
      const settingsRef = doc(db, "settings", "global");
      await setDoc(
        settingsRef,
        { ...updates, password: "123456" },
        { merge: true },
      );
      if (updates.announcement !== undefined) {
        setIsAdminMessageVisible(true);
        setChromeAlert("Đã lưu thông báo thành công!");
      } else if (updates.businessHours || updates.slotDuration) {
        setChromeAlert("Đã cập nhật khung giờ làm việc chung thành công!");
      }
    } catch (err) {
      console.error("Settings error:", err);
      handleFirestoreError(err, "write", "settings/global");
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const pushToTrackingHistory = (tracking: any) => {
    setTrackingHistory((prev) => {
      const newHistory = [...prev, JSON.parse(JSON.stringify(tracking || {}))];
      if (newHistory.length > 30)
        return newHistory.slice(newHistory.length - 30);
      return newHistory;
    });
  };

  const handleUndoTracking = async (courseId: string) => {
    if (trackingHistory.length === 0) return;
    const previousTracking = trackingHistory[trackingHistory.length - 1];
    try {
      await updateDoc(doc(db, "courses", courseId), {
        tracking: previousTracking,
      });
      setTrackingHistory((prev) => prev.slice(0, prev.length - 1));
    } catch (err) {
      console.error(err);
    }
  };

  // States for Manage Booking
  const [manageAppointment, setManageAppointment] =
    useState<Appointment | null>(null);
  const [managePassword, setManagePassword] = useState("");
  const [isManaging, setIsManaging] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [adminReason, setAdminReason] = useState("");
  const [isSuddenCancel, setIsSuddenCancel] = useState(true);

  const [isEditingManageTime, setIsEditingManageTime] = useState(false);
  const [manageEditDateStr, setManageEditDateStr] = useState<string>("");
  const [manageEditSlots, setManageEditSlots] = useState<string[]>([]);
  const [manageEditTime, setManageEditTime] = useState("");
  const [manageEditReason, setManageEditReason] = useState("");
  const [isFetchingEditSlots, setIsFetchingEditSlots] = useState(false);

  // Simple Admin Login State
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [adminLogin, setAdminLogin] = useState({ user: "", pass: "" });

  // Auth & Admin check
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const adminDoc = await getDoc(doc(db, "admins", u.uid));
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
    if (adminLogin.user === "admin" && adminLogin.pass === "123456") {
      setIsStaticAdmin(true);
      localStorage.setItem("isStaticAdmin", "true");
      setShowLoginModal(false);
      setAdminLogin({ user: "", pass: "" });
      setView("admin");
    } else {
      setChromeAlert("Sai tài khoản hoặc mật khẩu!");
    }
  };

  const handleSimpleLogout = () => {
    setIsStaticAdmin(false);
    localStorage.removeItem("isStaticAdmin");
    setView("booking");
  };

  // Fetch Settings
  useEffect(() => {
    const unsubSettings = onSnapshot(
      doc(db, "settings", "global"),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setSlotDuration(data.slotDuration || 30);
          setAnnouncement(data.announcement || "");
          if (data.passwords) {
            setDbRolePasswords(data.passwords);
            setEditingPasswords(data.passwords);
          }
          if (data.businessHours && Array.isArray(data.businessHours)) {
            setBusinessHours(data.businessHours);
          } else if (data.businessHours && !Array.isArray(data.businessHours)) {
            // Migration from old single range to new array format
            setBusinessHours([
              { label: "Sáng", start: data.businessHours.start || 8, end: 12 },
              { label: "Chiều", start: 12, end: data.businessHours.end || 22 },
            ]);
          }
        }
      },
      (err) => handleFirestoreError(err, "get", "settings/global"),
    );
    return () => unsubSettings();
  }, []);

  // Fetch appointments and locked slots for selected date
  useEffect(() => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");

    // Fetch Appointments
    const qApps = query(
      collection(db, "appointments"),
      where("date", "==", dateStr),
    );
    const unsubApps = onSnapshot(
      qApps,
      (snapshot) => {
        const apps = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as Appointment,
        );
        // Store all for admin to see cancelled, but filter for view
        setAppointments(apps);
      },
      (err) => handleFirestoreError(err, "list", "appointments"),
    );

    // Fetch Locked Slots
    const qLocked = query(
      collection(db, "lockedSlots"),
      where("date", "==", dateStr),
    );
    const unsubLocked = onSnapshot(
      qLocked,
      (snapshot) => {
        const locked = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as any,
        );
        setLockedSlots(locked);
      },
      (err) => handleFirestoreError(err, "list", "lockedSlots"),
    );

    // Fetch Day Config
    const unsubDayConfig = onSnapshot(
      doc(db, "dayConfigs", dateStr),
      (snapshot) => {
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
            businessHours: businessHours,
          });
        }
      },
      (err) => handleFirestoreError(err, "get", `dayConfigs/${dateStr}`),
    );

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

    const unsubAllConfigs = onSnapshot(
      collection(db, "dayConfigs"),
      (snapshot) => {
        const configs: { [key: string]: DayConfig } = {};
        snapshot.forEach((doc) => {
          configs[doc.id] = doc.data() as DayConfig;
        });
        setAllDayConfigs(configs);
      },
      (err) => handleFirestoreError(err, "list", "dayConfigs"),
    );

    return () => unsubAllConfigs();
  }, [isAdmin]);

  // Fetch 10 most recent global cancellations
  useEffect(() => {
    if (!isAdmin) {
      setRecentCancelled([]);
      return;
    }

    const qRecent = query(
      collection(db, "appointments"),
      where("status", "==", "cancelled"),
      orderBy("cancelledAt", "desc"),
      limit(10),
    );

    const unsubRecent = onSnapshot(
      qRecent,
      (snapshot) => {
        const apps = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as Appointment,
        );
        setRecentCancelled(apps);
      },
      (err) => handleFirestoreError(err, "list", "appointments"),
    );

    return () => unsubRecent();
  }, [isAdmin]);

  // Fetch CVs (Admin sees all, User sees none directly)
  useEffect(() => {
    if (!isAdmin) {
      setCvs([]);
      return;
    }

    const qCVs = query(collection(db, "cvs"), orderBy("createdAt", "desc"));
    const unsubCVs = onSnapshot(
      qCVs,
      (snapshot) => {
        const docs = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as CV,
        );
        setCvs(docs);
      },
      (err) => handleFirestoreError(err, "list", "cvs"),
    );

    const qCourses = query(
      collection(db, "courses"),
      orderBy("createdAt", "desc"),
    );
    const unsubCourses = onSnapshot(
      qCourses,
      (snapshot) => {
        const docs = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as Course,
        );
        setCourses(docs);
      },
      (err) => handleFirestoreError(err, "list", "courses"),
    );

    return () => {
      unsubCVs();
      unsubCourses();
    };
  }, [isAdmin]);

  // Removed aggressive auto-update logic because user wants to manually select students.
  /*
  useEffect(() => {
    if (!isAdmin || cvs.length === 0 || courses.length === 0) return;
    
    courses.forEach(async (course) => {
      const today = format(new Date(), 'yyyy-MM-dd');
      if (today <= course.closingDate) {
        // Find CVs in range
        const start = new Date(course.startDate).setHours(0,0,0,0);
        const end = new Date(course.endDate).setHours(23,59,59,999);
        const newIds = cvs.filter(cv => {
          const cvDate = cv.createdAt ? (cv.createdAt.toDate ? cv.createdAt.toDate().getTime() : (typeof cv.createdAt === 'number' ? cv.createdAt : new Date(cv.createdAt).getTime())) : 0;
          return cvDate >= start && cvDate <= end && !course.studentIds.includes(cv.id) && !(course.removedStudentIds || []).includes(cv.id);
        }).map(c => c.id);

        if (newIds.length > 0) {
          try {
            await updateDoc(doc(db, 'courses', course.id), {
              studentIds: [...course.studentIds, ...newIds]
            });
          } catch (e) {
            console.error('Failed to auto-update course', e);
          }
        }
      }
    });
  }, [cvs, courses, isAdmin]);
  */

  const formatTime = (h: number) => {
    // Avoid floating point inaccuracies by using a very small epsilon before rounding
    const totalMinutes = Math.round(h * 60);
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
  };

  const getTimeOptions = (label: string, duration: number) => {
    // Sáng: 08:00 - 12:00, Chiều: 12:00 - 22:00
    const startMins = (label === "Sáng" ? 8 : 12) * 60;
    const endMins = (label === "Sáng" ? 12 : 22) * 60;
    const options: number[] = [];
    
    for (let m = startMins; m <= endMins; m += duration) {
      options.push(m / 60);
    }
    return options;
  };

  const generateSlots = () => {
    const rawSlots: string[] = [];
    const activeDuration = currentDayConfig?.duration || slotDuration;
    const activeBusinessHours =
      currentDayConfig?.businessHours || businessHours;

    activeBusinessHours.forEach((range) => {
      // Check if this session is enabled for the current day
      if (currentDayConfig) {
        if (range.label === "Sáng" && !currentDayConfig.morningActive) return;
        if (range.label === "Chiều" && !currentDayConfig.afternoonActive)
          return;
      }

      let current = parse(formatTime(range.start), "H:mm", new Date());
      const end = parse(formatTime(range.end), "H:mm", new Date());

      while (current < end) {
        rawSlots.push(format(current, "HH:mm"));
        current = addMinutes(current, activeDuration);
      }
    });

    // Ensure unique slots in case of overlapping business hour ranges
    return Array.from(new Set(rawSlots)).sort();
  };

  const slots = generateSlots();

  // Auto-switch to tomorrow if today's schedule is finished
  useEffect(() => {
    if (view !== "booking" || hasAutoSwitchedRef.current) return;

    const today = startOfDay(new Date());
    if (isSameDay(selectedDate, today)) {
      const currentTimeStr = format(now, "HH:mm");

      // 1. Check for upcoming active appointments
      const upcomingApps = appointments.filter(
        (a) => a.status === "active" && (a.endTime || "23:59") > currentTimeStr,
      );

      // 2. Check for bookable slots
      const takenSlotStartTimes = new Set(
        appointments
          .filter((a) => a.status !== "cancelled")
          .map((a) => a.startTime),
      );
      const availableSlots = slots.filter((s) => {
        const isPastSlot = s <= currentTimeStr;
        return (
          !takenSlotStartTimes.has(s) &&
          !isPastSlot &&
          !lockedSlots.some((l) => l.startTime === s)
        );
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
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const activeDuration = currentDayConfig?.duration || slotDuration;
      const endTime = format(
        addMinutes(parse(selectedSlot, "HH:mm", new Date()), activeDuration),
        "HH:mm",
      );

      const appointmentsRef = collection(db, "appointments");
      await addDoc(appointmentsRef, {
        clientName: formData.name,
        guide: formData.guide,
        question: formData.question,
        date: dateStr,
        startTime: selectedSlot,
        endTime: endTime,
        password: formData.password,
        status: "active",
        createdAt: serverTimestamp(),
      });

      setBookingSuccess(true);
      setFormData({ name: "", guide: "", question: "", password: "" });
      setSelectedSlot(null);
      setShowBookingModal(false);
      setTimeout(() => setBookingSuccess(false), 5000);
    } catch (err) {
      console.error("Booking error:", err);
      if (
        err instanceof Error &&
        err.name === "FirebaseError" &&
        (err as any).code === "permission-denied"
      ) {
        handleFirestoreError(err, "create", "appointments");
      }
      setChromeAlert(
        "Đã có lỗi xảy ra. Vui lòng kiểm tra lại thông tin. (Mã PIN tối thiểu 4 ký tự)",
      );
    } finally {
      setIsBooking(false);
    }
  };

  const handleRestoreAppointment = async (appId?: string) => {
    const id = appId || manageAppointment?.id;
    if (!id || !isAdmin) return;
    setIsManaging(true);
    try {
      await updateDoc(doc(db, "appointments", id), {
        status: "active",
        cancelledByAdmin: false,
        cancellationReason: deleteField(),
        adminAuth: "123456",
      });
      setShowManageModal(false);
      setManageAppointment(null);
    } catch (err) {
      console.error("Restore error:", err);
      handleFirestoreError(err, "update", `appointments/${id}`);
    } finally {
      setIsManaging(false);
    }
  };

  const handleEditManageTimeSetup = async (app?: Appointment) => {
    const targetApp = app || manageAppointment;
    if (!targetApp) return;
    setIsEditingManageTime(true);
    setManageEditDateStr(targetApp.date);
    setManageEditTime(targetApp.startTime);
    setManageEditReason("");
    await loadManageEditSlots(targetApp.date, targetApp.id);
  };

  const loadManageEditSlots = async (dateStr: string, appId?: string) => {
    setIsFetchingEditSlots(true);
    try {
      const currentAppId = appId || manageAppointment?.id;
      let cfg: DayConfig | null = null;
      const daySnap = await getDoc(doc(db, "dayConfigs", dateStr));
      if (daySnap.exists()) {
        cfg = daySnap.data() as DayConfig;
      }

      const dateObj = parse(dateStr, "yyyy-MM-dd", new Date());
      const activeBusinessHours = cfg?.businessHours || businessHours;
      const activeDuration = cfg?.duration || slotDuration;

      const rawSlots: string[] = [];
      activeBusinessHours.forEach((range) => {
        if (cfg) {
          if (range.label === "Sáng" && !cfg.morningActive) return;
          if (range.label === "Chiều" && !cfg.afternoonActive) return;
        }
        let current = parse(formatTime(range.start), "H:mm", new Date());
        const end = parse(formatTime(range.end), "H:mm", new Date());
        while (current < end) {
          rawSlots.push(format(current, "HH:mm"));
          current = addMinutes(current, activeDuration);
        }
      });
      const allSlots = Array.from(new Set(rawSlots)).sort();

      const appSnap = await getDocs(
        query(
          collection(db, "appointments"),
          where("date", "==", dateStr),
          where("status", "==", "active"),
        ),
      );
      const taken = new Set<string>();
      appSnap.forEach((docSnap) => {
        if (docSnap.id !== manageAppointment?.id) {
          taken.add(docSnap.data().startTime);
        }
      });

      const lockSnap = await getDocs(
        query(collection(db, "lockedSlots"), where("date", "==", dateStr)),
      );
      const locked = new Set<string>();
      lockSnap.forEach((docSnap) => locked.add(docSnap.data().startTime));

      // Also filter out past slots if dateStr is today
      const isSelectedToday = isSameDay(dateObj, startOfDay(new Date()));
      const currentTimeStr = format(now, "HH:mm");

      const freeSlots = allSlots.filter((s) => {
        const isPastSlot = isSelectedToday && s <= currentTimeStr;
        return !taken.has(s) && !locked.has(s) && !isPastSlot;
      });
      setManageEditSlots(freeSlots);
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetchingEditSlots(false);
    }
  };

  const handleEditTimeDateChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const val = e.target.value;
    setManageEditDateStr(val);
    setManageEditTime("");
    if (val) {
      await loadManageEditSlots(val);
    }
  };

  const onSaveManageEditTime = async () => {
    if (!manageAppointment || !manageEditDateStr || !manageEditTime) return;
    setIsManaging(true);
    try {
      let activeDuration = slotDuration;
      const daySnap = await getDoc(doc(db, "dayConfigs", manageEditDateStr));
      if (daySnap.exists()) {
        activeDuration = daySnap.data().duration;
      }
      const endTime = format(
        addMinutes(parse(manageEditTime, "HH:mm", new Date()), activeDuration),
        "HH:mm",
      );

      await updateDoc(doc(db, "appointments", manageAppointment.id), {
        date: manageEditDateStr,
        startTime: manageEditTime,
        endTime: endTime,
        timeEditedByAdmin: true,
        timeEditReason: manageEditReason || deleteField(),
        adminAuth: isAdmin ? "123456" : deleteField(),
      }).catch((err) =>
        handleFirestoreError(
          err,
          "update",
          `appointments/${manageAppointment.id}`,
        ),
      );

      setIsEditingManageTime(false);
      setShowManageModal(false);
      setManageAppointment(null);
    } catch (err) {
      console.error(err);
      alert("Đã xảy ra lỗi khi sửa thời gian: " + err);
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
          await deleteDoc(doc(db, "appointments", manageAppointment.id));
        } else {
          await updateDoc(doc(db, "appointments", manageAppointment.id), {
            status: "cancelled",
            cancellationReason:
              adminReason ||
              (isSuddenCancel
                ? "Lý do đột xuất từ phía Người kết nối."
                : "Lịch hẹn bị hủy do thông tin sai hoặc yêu cầu thay đổi."),
            cancelledByAdmin: isSuddenCancel,
            cancelledAt: serverTimestamp(),
            adminAuth: "123456",
          }).catch((err) =>
            handleFirestoreError(
              err,
              "update",
              `appointments/${manageAppointment.id}`,
            ),
          );
        }
      } else {
        // Strict PIN Verification
        if (!managePassword) {
          setChromeAlert("Vui lòng nhập Mã PIN!");
          setIsManaging(false);
          return;
        }

        const storedPassword = (manageAppointment as any).password;
        if (managePassword.trim() !== String(storedPassword).trim()) {
          setChromeAlert("Sai Mã PIN! Vui lòng kiểm tra lại.");
          setIsManaging(false);
          return;
        }

        await updateDoc(doc(db, "appointments", manageAppointment.id), {
          status: "cancelled",
          cancelledAt: serverTimestamp(),
        }).catch((err) =>
          handleFirestoreError(
            err,
            "update",
            `appointments/${manageAppointment.id}`,
          ),
        );
      }
      setShowManageModal(false);
      setManageAppointment(null);
      setManagePassword("");
      setAdminReason("");
    } catch (err) {
      console.error("Cancel error:", err);
      if (!(err instanceof Error) || !err.message.startsWith("{")) {
        setChromeAlert("Có lỗi xảy ra. Vui lòng liên hệ quản trị viên.");
      }
    } finally {
      setIsManaging(false);
    }
  };

  const handleCVSearch = async () => {
    const searchPIN = cvSearchPIN.trim();
    const searchPhoneInfo = cvSearchPhoneLast4.trim();

    if (!searchPIN || !searchPhoneInfo) {
      setChromeAlert("Vui lòng nhập cả số điện thoại và mã PIN.");
      return;
    }
    setIsSearchingCV(true);
    setFoundCVs([]);
    try {
      const q = query(collection(db, "cvs"));
      const querySnapshot = await getDocs(q);

      const foundDocs = querySnapshot.docs.filter((doc) => {
        const data = doc.data();
        const dbPhone = data.phone ? String(data.phone).replace(/\D/g, "") : "";
        const dbPhoneLast4 = data.phoneLast4
          ? String(data.phoneLast4).trim()
          : "";
        const dbGuidePhoneLast4 = data.guidePhoneLast4
          ? String(data.guidePhoneLast4).trim()
          : "";
        const dbPin = data.password ? String(data.password).trim() : "";

        const matchesPhone =
          dbPhoneLast4 === searchPhoneInfo ||
          (dbPhone.length >= 4 && dbPhone.endsWith(searchPhoneInfo)) ||
          dbGuidePhoneLast4 === searchPhoneInfo;
        return matchesPhone && dbPin === searchPIN;
      });

      if (foundDocs.length > 0) {
        setFoundCVs(
          foundDocs.map((doc) => ({ id: doc.id, ...doc.data() }) as CV),
        );
      } else {
        setChromeAlert("Thông tin 4 số điện thoại và mã pin không chính xác.");
      }
    } catch (err) {
      console.error("CV search error:", err);
      setChromeAlert("Có lỗi xảy ra. Vui lòng thử lại sau.");
    } finally {
      setIsSearchingCV(false);
    }
  };

  const handleCVAutoFill = (text: string) => {
    setCvAutoFillText(text);
    if (!text) return;

    const lines = text.split("\n");
    const newFormData = { ...cvFormData };

    lines.forEach((line) => {
      const trimmed = line.trim();

      const getValue = (indicator: string, label: string) => {
        const escapedIndicator = indicator.replace(".", "\\.");
        const regex = new RegExp(
          `^(${escapedIndicator}\\s*)?${label}([^:]*:)?\\s*(.*)$`,
          "i",
        );
        const match = trimmed.match(regex);
        if (match) {
          return match[3].trim();
        }
        return null;
      };

      const fullName = getValue("1.", "Họ tên");
      if (fullName !== null) newFormData.fullName = fullName;

      const phone = getValue("2.", "Điện thoại");
      if (phone !== null) newFormData.phone = phone;

      const age = getValue("3.", "Tuổi");
      if (age !== null) newFormData.age = age;

      if (cvModalTab === "create") {
        const address = getValue("4.", "Địa Chỉ") || getValue("4.", "Địa chỉ");
        if (address !== null) newFormData.address = address;

        const job = getValue("5.", "Công Việc") || getValue("5.", "Công việc");
        if (job !== null) newFormData.job = job;

        const target = getValue("6.", "Mong muốn");
        if (target !== null) newFormData.target = target;

        const guideName =
          getValue("7.", "Tên hướng dẫn viên") ||
          getValue("7.", "Người hướng dẫn");
        if (guideName !== null) newFormData.guideName = guideName;

        const guidePhoneLast4 =
          getValue("8.", "4 số cuối") || getValue("8.", "số điện thoại");
        if (guidePhoneLast4 !== null)
          newFormData.guidePhoneLast4 = guidePhoneLast4;
      } else {
        const guideName =
          getValue("4.", "Tên hướng dẫn viên") ||
          getValue("4.", "Người hướng dẫn") ||
          getValue("7.", "Tên hướng dẫn viên");
        if (guideName !== null) newFormData.guideName = guideName;

        const prevCourse =
          getValue("5.", "Tham gia") ||
          getValue("5.", "Khóa") ||
          getValue("5.", "Đã tham gia");
        if (prevCourse !== null) {
          const match = courses.find(
            (c) =>
              c.name.toLowerCase() === prevCourse.toLowerCase() ||
              prevCourse.toLowerCase().includes(c.name.toLowerCase()) ||
              c.name.toLowerCase().includes(prevCourse.toLowerCase()),
          );
          if (match) newFormData.previousCourse = match.name;
          else newFormData.previousCourse = prevCourse;
        }
      }
    });

    setCvFormData(newFormData);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        setChromeAlert("Vui lòng tải lên định dạng ảnh.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;

          const MAX_DIMENSION = 800; // Resize to max 800px

          if (width > height) {
            if (width > MAX_DIMENSION) {
              height = Math.round(height * (MAX_DIMENSION / width));
              width = MAX_DIMENSION;
            }
          } else {
            if (height > MAX_DIMENSION) {
              width = Math.round(width * (MAX_DIMENSION / height));
              height = MAX_DIMENSION;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            // Convert to base64 with jpeg format and 0.6 quality (60%)
            const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.6);

            // Limit to 1MB to be safe for Firestore 1MB max document limit
            const sizeInKB = Math.round(
              ((compressedDataUrl.length - 22) * 3) / 4 / 1024,
            );
            if (sizeInKB > 900) {
              setChromeAlert(
                "Ảnh vẫn quá lớn sau khi nén tự động. Vui lòng thử ảnh hoặc chọn loại ảnh khác.",
              );
              return;
            }

            setCvFormData((prev) => ({
              ...prev,
              paymentImageUrl: compressedDataUrl,
            }));
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCVSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isReenroll = cvModalTab === "reenroll";

    if (!isReenroll && cvFormData.password.trim().length < 4) {
      setChromeAlert("Mã PIN phải tối thiểu 4 ký tự.");
      return;
    }
    const safeFullName = cvFormData.fullName.trim();
    const safePhone = cvFormData.phone.trim();

    if (
      !safeFullName ||
      !safePhone ||
      !cvFormData.age ||
      !cvFormData.guideName ||
      (!isReenroll && !cvFormData.guidePhoneLast4)
    ) {
      setChromeAlert("Vui lòng điền đầy đủ các trường bắt buộc.");
      return;
    }
    if (isReenroll && !cvFormData.previousCourse) {
      setChromeAlert("Vui lòng nhập khóa trước đã tham gia.");
      return;
    }

    if (!isReenroll && !cvFormData.paymentImageUrl) {
      setChromeAlert("Vui lòng tải lên Ảnh chuyển khoản thành công.");
      return;
    }
    if (safePhone.replace(/\D/g, "").length < 4) {
      setChromeAlert("Số điện thoại học viên phải có ít nhất 4 chữ số.");
      return;
    }
    if (!isReenroll && cvFormData.guidePhoneLast4.trim().length !== 4) {
      setChromeAlert("Trường số 8 phải là đúng 4 số cuối của SĐT.");
      return;
    }
    setIsSubmittingCV(true);
    try {
      const phoneLast4 = safePhone.replace(/\D/g, "").slice(-4);
      if (editingCvId) {
        const existingCv = cvs.find((c) => c.id === editingCvId);
        let updatedData: any = {
          ...cvFormData,
          fullName: safeFullName,
          phone: safePhone,
          password:
            isReenroll && !cvFormData.password
              ? "0000"
              : cvFormData.password.trim(),
          guidePhoneLast4:
            isReenroll && !cvFormData.guidePhoneLast4
              ? "0000"
              : cvFormData.guidePhoneLast4.trim(),
          phoneLast4,
        };

        if (existingCv?.status === "rejected") {
          updatedData.status = isReenroll ? "approved" : "pending";
          updatedData.cancellationReason = deleteField();
        }

        if (existingCv?.appRejectedReason) {
          updatedData.status = "approved";
          updatedData.appRejectedReason = deleteField();
        }

        await updateDoc(doc(db, "cvs", editingCvId), updatedData);
      } else {
        const newData: any = {
          ...cvFormData,
          fullName: safeFullName,
          phone: safePhone,
          password:
            isReenroll && !cvFormData.password
              ? "0000"
              : cvFormData.password.trim(),
          guidePhoneLast4:
            isReenroll && !cvFormData.guidePhoneLast4
              ? "0000"
              : cvFormData.guidePhoneLast4.trim(),
          phoneLast4,
          status: isReenroll ? "approved" : "pending",
          type: isReenroll ? "reenroll" : "new",
          createdAt: serverTimestamp(),
        };
        if (isReenroll) {
          newData.appApproved = true;
        }
        const docRef = await addDoc(collection(db, "cvs"), newData);
        const newCvId = docRef.id;

        const currentTimestamp = Date.now();
        const coursesToUpdate = courses.filter((c) => {
          if (!c.autoAddFromDate || !c.closingDate)
            return false;
          const fromDate = new Date(c.autoAddFromDate).setHours(0, 0, 0, 0);
          const toDate = new Date(c.closingDate).setHours(23, 59, 59, 999);
          return currentTimestamp >= fromDate && currentTimestamp <= toDate;
        });

        if (coursesToUpdate.length > 0) {
          await Promise.all(
            coursesToUpdate.map((c) =>
              updateDoc(doc(db, "courses", c.id), {
                studentIds: [...c.studentIds, newCvId],
              }),
            ),
          );
        }
      }
      setCvFormData({
        fullName: "",
        phone: "",
        age: "",
        address: "",
        job: "",
        target: "",
        password: "",
        paymentImageUrl: "",
        guideName: "",
        guidePhoneLast4: "",
        previousCourse: "",
      });
      setCvAutoFillText("");

      if (editingCvId) {
        // Keep the modal open behind the success dialog, or we can close it. We'll close the main CV modal here.
        setShowCVModal(false);
        setEditingCvId(null);
      }

      setCvModalTab(isReenroll ? "reenroll" : "create");
      setShowCVSaveSuccess(true);
    } catch (err) {
      console.error("CV submit error:", err);
      handleFirestoreError(
        err,
        editingCvId ? "update" : "create",
        editingCvId ? `cvs/${editingCvId}` : "cvs",
      );
      setChromeAlert("Lỗi khi lưu hồ sơ. Vui lòng thử lại.");
    } finally {
      setIsSubmittingCV(false);
    }
  };

  const startEditCV = (cv: CV) => {
    setCvFormData({
      fullName: cv.fullName,
      phone: cv.phone,
      age: cv.age,
      address: cv.address || "",
      job: cv.job || "",
      target: cv.target || "",
      guideName: cv.guideName,
      guidePhoneLast4: cv.guidePhoneLast4 || "",
      password: cv.password || "",
      paymentImageUrl: cv.paymentImageUrl || "",
      previousCourse: cv.previousCourse || "",
    });
    setEditingCvId(cv.id);
    setCvModalTab(cv.type === "reenroll" ? "reenroll" : "create");
    setShowCVModal(true);
  };

  const handleCVAction = async (
    cvId: string,
    type: "approve" | "reject" | "restore" | "approveApp",
  ) => {
    if (type === "restore" || type === "approveApp" || type === "reject") {
      setCvActionModal({ show: true, cvId, type });
      setAdminPinInput("");
      if (type === "reject") setAppRejectReasonInput("");
    } else {
      if (!isAdmin) return;

      const selectedReviewer = localReviewers[cvId] || "";
      if (!selectedReviewer) {
        setChromeAlert("Vui lòng chọn Người duyệt trước khi thực hiện.");
        return;
      }

      setIsProcessingAction(true);
      try {
        const newStatus: CV["status"] =
          type === "approve" ? "approved" : "rejected";

        await updateDoc(doc(db, "cvs", cvId), {
          status: newStatus,
          processedAt: serverTimestamp(),
          processedBy: selectedReviewer,
          adminAuth: "123456",
        });
      } catch (err) {
        console.error("CV Action error:", err);
        handleFirestoreError(err, "update", `cvs/${cvId}`);
      } finally {
        setIsProcessingAction(false);
      }
    }
  };

  const isActionUnlocked = () => {
    if (!cvActionModal.type) return false;
    if (cvActionModal.type === "restore") {
      const cvToRestore = cvs.find((c) => c.id === cvActionModal.cvId);
      if (cvToRestore?.appRejectedReason) return unlockedRoles.app_approver;
      return unlockedRoles.accountant;
    }
    if (cvActionModal.type === "approve") return unlockedRoles.accountant;
    if (
      cvActionModal.type === "bulkApproveApp" ||
      cvActionModal.type === "bulkRejectApp" ||
      cvActionModal.type === "approveApp"
    )
      return unlockedRoles.app_approver;
    if (cvActionModal.type === "bulkDeleteCv") return unlockedRoles.delete;
    return false;
  };

  const confirmCVAction = async () => {
    if (!isAdmin || !cvActionModal.type) return;

    let requiredPin = dbRolePasswords.learning;
    if (cvActionModal.type === "restore") {
      const cvToRestore = cvs.find((c) => c.id === cvActionModal.cvId);
      if (cvToRestore?.appRejectedReason) {
        requiredPin = dbRolePasswords.app_approver;
      } else {
        requiredPin = dbRolePasswords.accountant;
      }
    } else if (cvActionModal.type === "approve") {
      requiredPin = dbRolePasswords.accountant;
    } else if (
      cvActionModal.type === "bulkApproveApp" ||
      cvActionModal.type === "approveApp"
    ) {
      requiredPin = dbRolePasswords.app_approver;
    } else if (cvActionModal.type === "bulkDeleteCv") {
      requiredPin = dbRolePasswords.delete;
    }

    // modal is used for restore and app actions
    if (
      cvActionModal.type !== "bulkRejectApp" &&
      cvActionModal.type !== "reject" &&
      !isActionUnlocked() &&
      adminPinInput !== requiredPin &&
      adminPinInput !== dbRolePasswords.learning
    ) {
      setChromeAlert("Mật khẩu không chính xác!");
      return;
    }

    setIsProcessingAction(true);
    try {
      if (cvActionModal.type === "reject" && cvActionModal.cvId) {
        const selectedReviewer = localReviewers[cvActionModal.cvId] || "Admin";
        await updateDoc(doc(db, "cvs", cvActionModal.cvId), {
          status: "rejected",
          cancellationReason: appRejectReasonInput || "Không đủ điều kiện",
          processedAt: serverTimestamp(),
          processedBy: selectedReviewer,
          adminAuth: "123456",
        });
        setAppRejectReasonInput("");
      } else if (cvActionModal.type === "enableDeleteCvMode") {
        setIsDeleteCvMode(true);
        setIsAppApprovalMode(false);
        setChromeAlert("Đã bật Chế độ Xóa CV.");
      } else if (cvActionModal.type === "bulkDeleteCv") {
        for (const cvId of selectedDeleteCvIds) {
          await deleteDoc(doc(db, "cvs", cvId));
        }
        setChromeAlert(`Đã xóa thành công ${selectedDeleteCvIds.length} CV.`);
        setSelectedDeleteCvIds([]);
      } else if (cvActionModal.type === "enableAppApprovalMode") {
        setIsAppApprovalMode(true);
        setIsDeleteCvMode(false);
        setChromeAlert("Đã bật Chế độ Duyệt App.");
      } else if (
        cvActionModal.type === "bulkApproveApp" ||
        cvActionModal.type === "bulkRejectApp"
      ) {
        const isApproving = cvActionModal.type === "bulkApproveApp";
        for (const cvId of selectedAppCvIds) {
          const updateData: any = {
            appApproved: isApproving,
            appApprovedBy: "Admin",
            appApprovedAt: serverTimestamp(),
            adminAuth: "123456",
          };
          if (!isApproving) {
            updateData.appRejectedReason =
              appRejectReasonInput || "Không đủ điều kiện";
          } else {
            updateData.appRejectedReason = deleteField();
          }

          await updateDoc(doc(db, "cvs", cvId), updateData);
        }
        setChromeAlert(
          `Đã ${isApproving ? "duyệt" : "từ chối"} App cho ${selectedAppCvIds.length} Học viên.`,
        );
        setSelectedAppCvIds([]);
        setAppRejectReasonInput("");
      } else if (cvActionModal.type === "approveApp" && cvActionModal.cvId) {
        const cvToApprove = cvs.find((c) => c.id === cvActionModal.cvId);
        if (cvToApprove) {
          const newAppApproved = !cvToApprove.appApproved;
          await updateDoc(doc(db, "cvs", cvActionModal.cvId), {
            appApproved: newAppApproved,
            appApprovedBy: "Admin",
            appApprovedAt: serverTimestamp(),
            appRejectedReason: deleteField(),
            adminAuth: "123456",
          });
          setChromeAlert(
            cvToApprove.appApproved
              ? "Đã hủy duyệt App."
              : "Đã duyệt App thành công.",
          );
          setCvFilter("approved");
        }
      } else if (cvActionModal.type === "restore" && cvActionModal.cvId) {
        const cvToRestore = cvs.find((c) => c.id === cvActionModal.cvId);

        if (cvToRestore?.appRejectedReason) {
          await updateDoc(doc(db, "cvs", cvActionModal.cvId), {
            status: "approved",
            appRejectedReason: deleteField(),
            processedAt: serverTimestamp(),
            adminAuth: "123456",
          });
        } else {
          await updateDoc(doc(db, "cvs", cvActionModal.cvId), {
            status: "pending",
            processedAt: serverTimestamp(),
            processedBy: deleteField(),
            cancellationReason: deleteField(),
            adminAuth: "123456",
          });
        }
      }

      setCvActionModal({ show: false, cvId: "", type: null });
    } catch (err) {
      console.error("CV Action error:", err);
      handleFirestoreError(
        err,
        "update",
        cvActionModal.type.startsWith("bulk")
          ? `cvs`
          : `cvs/${cvActionModal.cvId}`,
      );
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleRoleUnlock = (
    role: "accountant" | "app_approver" | "delete" | "learning",
  ) => {
    if (rolePasswords[role] === dbRolePasswords[role]) {
      setUnlockedRoles((prev) => ({ ...prev, [role]: true }));
      setChromeAlert("Mở khóa thành công!");
    } else {
      setChromeAlert("Mật khẩu không chính xác!");
    }
  };

  const cvFilterMapping = {
    pending: (c: CV) => c.status === "pending",
    processing: (c: CV) =>
      c.status === "approved" &&
      !c.appApproved &&
      (!c.appRejectedReason || c.appRejectedReason === ""),
    completed: (c: CV) => c.status === "approved" && c.appApproved === true,
    rejected: (c: CV) =>
      c.status === "rejected" ||
      (c.appRejectedReason && c.appRejectedReason !== ""),
  };

  const getFilteredCVs = () => {
    let filtered = cvs;
    if (adminCvSearchText.trim() !== "") {
      const searchTerms = adminCvSearchText.toLowerCase().trim().split(" ");
      filtered = filtered.filter((c) => {
        const textToSearch =
          `${c.fullName || ""} ${c.phone || ""} ${c.studentId || ""} ${c.companion || ""}`.toLowerCase();
        return searchTerms.every((term) => textToSearch.includes(term));
      });
    }

    return filtered.filter((c) => {
      if (adminCvTab === "learning") return true;

      // Tab filtering
      if (statusSubFilter === "all")
        return adminCvTab === "delete" ? true : c.type !== "reenroll";
      if (statusSubFilter === "pending")
        return cvFilterMapping.pending(c) && c.type !== "reenroll";
      if (statusSubFilter === "processing")
        return cvFilterMapping.processing(c) && c.type !== "reenroll";
      if (statusSubFilter === "completed")
        return cvFilterMapping.completed(c) && c.type !== "reenroll";
      if (statusSubFilter === "rejected")
        return cvFilterMapping.rejected(c) && c.type !== "reenroll";
      return true;
    });
  };

  const exportCVsToExcel = async (
    filterType: "all" | "completed" | "rejected",
  ) => {
    const { utils, writeFile } = await import("xlsx");

    let filteredData = cvs;
    
    // Always exclude re-enroll CVs for these exports as requested
    filteredData = filteredData.filter(c => c.type !== "reenroll");

    if (adminCvTab === "learning") {
      // ... existing learning filter if any ...
    }
    let filenameSuffix = "TatCa";
    let sheetName = "Tất cả";

    if (filterType === "completed") {
      filteredData = filteredData.filter(cvFilterMapping.completed);
      filenameSuffix = "DaHoanThanh";
      sheetName = "Đã hoàn thành";
    } else if (filterType === "rejected") {
      filteredData = filteredData.filter(cvFilterMapping.rejected);
      filenameSuffix = "TuChoi";
      sheetName = "Từ chối";
    }

    // Sort data: Ngày tạo CV mới nhất (desc) -> Người duyệt (asc) -> Hướng dẫn viên (asc)
    filteredData = [...filteredData].sort((a, b) => {
      // 1. Sort by day first (descending). We compare the start of the day to group them by same day.
      const dateA = a.createdAt
        ? a.createdAt.toDate
          ? startOfDay(a.createdAt.toDate()).getTime()
          : startOfDay(new Date(a.createdAt)).getTime()
        : 0;
      const dateB = b.createdAt
        ? b.createdAt.toDate
          ? startOfDay(b.createdAt.toDate()).getTime()
          : startOfDay(new Date(b.createdAt)).getTime()
        : 0;
      if (dateA !== dateB) {
        return dateB - dateA; // Descending by date
      }

      // 2. Same day -> Sort by reviewer
      const reviewerA = a.processedBy || "";
      const reviewerB = b.processedBy || "";
      if (reviewerA !== reviewerB) {
        return reviewerA.localeCompare(reviewerB);
      }

      // 3. Same day, same reviewer -> Sort by guide name
      const guideA = a.guideName || "";
      const guideB = b.guideName || "";
      return guideA.localeCompare(guideB);
    });

    let worksheetData;
    if (adminCvTab === "learning") {
      worksheetData = filteredData.map((cv, index) => ({
        STT: index + 1,
        "Ngày tạo CV": cv.createdAt
          ? format(
              cv.createdAt.toDate
                ? cv.createdAt.toDate()
                : typeof cv.createdAt === "number"
                  ? new Date(cv.createdAt)
                  : new Date(cv.createdAt),
              "dd/MM/yyyy HH:mm",
            )
          : "",
        "Ngày giờ duyệt": cv.processedAt
          ? format(
              cv.processedAt.toDate
                ? cv.processedAt.toDate()
                : typeof cv.processedAt === "number"
                  ? new Date(cv.processedAt)
                  : new Date(cv.processedAt),
              "dd/MM/yyyy HH:mm",
            )
          : "Chưa duyệt",
        "Người đồng hành": cv.companion || "",
        "Mã học viên": cv.studentId || "",
        "Họ tên": cv.fullName,
        Tuổi: cv.age,
        "Hướng dẫn viên": cv.guideName,
        "Group học tập": cv.studyGroup || "",
      }));
    } else {
      worksheetData = filteredData.map((cv, index) => ({
        STT: index + 1,
        "Người duyệt": cv.processedBy || "Chưa duyệt",
        "Ngày giờ duyệt": cv.processedAt
          ? format(
              cv.processedAt.toDate
                ? cv.processedAt.toDate()
                : typeof cv.processedAt === "number"
                  ? new Date(cv.processedAt)
                  : new Date(cv.processedAt),
              "dd/MM/yyyy HH:mm",
            )
          : "Chưa duyệt",
        "Ngày tạo CV": cv.createdAt
          ? format(
              cv.createdAt.toDate
                ? cv.createdAt.toDate()
                : typeof cv.createdAt === "number"
                  ? new Date(cv.createdAt)
                  : new Date(cv.createdAt),
              "dd/MM/yyyy HH:mm",
            )
          : "",
        "Số điện thoại": cv.phone,
        "Tên học viên": cv.fullName,
        Tuổi: cv.age,
        "Hướng dẫn viên": cv.guideName,
      }));
    }

    const workbook = utils.book_new();
    utils.book_append_sheet(
      workbook,
      utils.json_to_sheet(worksheetData),
      sheetName,
    );

    writeFile(
      workbook,
      `Danh_Sach_CV_${filenameSuffix}_${format(new Date(), "ddMMyyyy_HHmm")}.xlsx`,
    );
    setIsExportMenuOpen(false);
  };

  const toggleLockSlot = async (slot: string) => {
    if (!isAdmin) return;
    const existingLock = lockedSlots.find((l) => l.startTime === slot);
    try {
      if (existingLock) {
        await deleteDoc(doc(db, "lockedSlots", existingLock.id));
      } else {
        const dateStr = format(selectedDate, "yyyy-MM-dd");
        await addDoc(collection(db, "lockedSlots"), {
          date: dateStr,
          startTime: slot,
          password: "123456",
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
      if (err.code === "auth/popup-closed-by-user") {
        return;
      }

      console.error("Login error:", err);
      // Only show alert for other types of errors
      setChromeAlert(
        "Đã có lỗi xảy ra khi đăng nhập: " +
          (err.message || "Vui lòng thử lại sau."),
      );
    }
  };

  const logout = async () => {
    await signOut(auth);
    setView("booking");
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
            <h1 className="font-bold text-lg tracking-tight text-slate-900 uppercase">
              Đặt lịch kết nối
            </h1>
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
              onClick={() => setView(view === "booking" ? "admin" : "booking")}
              className={cn(
                "w-10 h-10 rounded-full transition-all duration-300 flex items-center justify-center shadow-lg active:scale-90 border-2",
                view === "admin"
                  ? "bg-yellow-400 border-amber-500 text-amber-900"
                  : "bg-yellow-100 border-yellow-300 text-yellow-700 hover:bg-yellow-200",
              )}
              title={
                view === "booking" ? "Mở bảng quản trị" : "Về trang đặt lịch"
              }
            >
              <User size={20} strokeWidth={2.5} />
            </button>
          )}

          {(user || isStaticAdmin) && (
            <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
              {user && (
                <img
                  src={user.photoURL || ""}
                  alt=""
                  className="w-8 h-8 rounded-full border border-yellow-400 shadow-sm"
                  referrerPolicy="no-referrer"
                />
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

      {view === "booking" && announcement && isAdminMessageVisible && (
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
          {view === "booking" ? (
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
                        setOverviewTab("empty");
                      }}
                      className="absolute -top-3 -right-3 px-5 py-2.5 bg-amber-950 text-yellow-400 rounded-[18px] flex flex-col items-center justify-center gap-0.5 shadow-2xl hover:scale-105 active:scale-95 transition-all z-10 border-4 border-white"
                      title="Mở danh sách slot trống"
                    >
                      <Plus size={14} strokeWidth={4} />
                      <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap">
                        Đặt lịch
                      </span>
                    </button>
                  );
                })()}

                <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-6">
                  <div className="space-y-2">
                    <h3 className="text-[10px] font-black text-yellow-600 uppercase tracking-[0.3em]">
                      Tổng quan lịch hẹn
                    </h3>
                    <div className="flex items-center gap-2">
                      <h4 className="text-3xl lg:text-4xl font-serif font-black text-slate-900 tracking-tight leading-none capitalize">
                        {format(selectedDate, "eeee, dd/MM", { locale: vi })}
                      </h4>

                      <div className="flex items-center ml-2">
                        <button
                          onClick={() => {
                            setSelectedDate(addDays(selectedDate, -1));
                            setSelectedSlot(null);
                          }}
                          className="p-2 text-slate-300 hover:text-yellow-600 hover:bg-yellow-50 rounded-xl transition-all active:scale-90"
                          title="Ngày trước"
                        >
                          <ChevronLeft size={24} strokeWidth={2.5} />
                        </button>

                        <button
                          onClick={() => {
                            setSelectedDate(addDays(selectedDate, 1));
                            setSelectedSlot(null);
                          }}
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
                      onClick={() => setOverviewTab("past")}
                      className={cn(
                        "text-left px-6 py-3 rounded-2xl border transition-all active:scale-95",
                        overviewTab === "past"
                          ? "bg-yellow-400 text-amber-950 border-yellow-400 shadow-lg"
                          : "bg-slate-50 text-slate-600 border-slate-100 hover:border-amber-200",
                      )}
                    >
                      <p
                        className={cn(
                          "text-sm font-black leading-tight",
                          overviewTab === "past"
                            ? "text-amber-950"
                            : "text-amber-950 font-black",
                        )}
                      >
                        {
                          appointments.filter((a) => {
                            const today = startOfDay(new Date());
                            const isPastDay = isBefore(selectedDate, today);
                            const isSelectedToday = isSameDay(
                              selectedDate,
                              new Date(),
                            );
                            const currentTimeStr = format(now, "HH:mm");
                            return (
                              a.status === "active" &&
                              (isPastDay ||
                                (isSelectedToday &&
                                  (a.endTime || "23:59") <= currentTimeStr))
                            );
                          }).length
                        }{" "}
                        phiên
                      </p>
                      <p
                        className={cn(
                          "text-[10px] uppercase font-bold tracking-widest",
                          overviewTab === "past"
                            ? "text-amber-800"
                            : "text-yellow-700",
                        )}
                      >
                        Đã kết thúc
                      </p>
                    </button>

                    <button
                      onClick={() => setOverviewTab("active")}
                      className={cn(
                        "text-left px-6 py-3 rounded-2xl border transition-all active:scale-95",
                        overviewTab === "active"
                          ? "bg-yellow-400 text-amber-950 border-yellow-400 shadow-lg"
                          : "bg-slate-50 text-slate-600 border-slate-100 hover:border-amber-200",
                      )}
                    >
                      <p
                        className={cn(
                          "text-sm font-black leading-tight",
                          overviewTab === "active"
                            ? "text-amber-950"
                            : "text-amber-950 font-black",
                        )}
                      >
                        {(() => {
                          const today = startOfDay(new Date());
                          const isPastDay = isBefore(selectedDate, today);
                          if (isPastDay) return 0;
                          const isSelectedToday = isSameDay(
                            selectedDate,
                            new Date(),
                          );
                          const currentTimeStr = format(now, "HH:mm");
                          return appointments.filter(
                            (a) =>
                              a.status === "active" &&
                              (!isSelectedToday ||
                                (a.endTime || "23:59") > currentTimeStr),
                          ).length;
                        })()}{" "}
                        phiên
                      </p>
                      <p
                        className={cn(
                          "text-[10px] uppercase font-bold tracking-widest",
                          overviewTab === "active"
                            ? "text-amber-800"
                            : "text-yellow-700",
                        )}
                      >
                        Xem lịch đã đặt
                      </p>
                    </button>

                    <button
                      onClick={() => setOverviewTab("empty")}
                      className={cn(
                        "text-left px-6 py-3 rounded-2xl border transition-all active:scale-95 group",
                        overviewTab === "empty"
                          ? "bg-yellow-400 text-amber-950 border-yellow-400 shadow-lg"
                          : "bg-white border-yellow-200",
                        isBefore(selectedDate, startOfDay(new Date())) &&
                          "opacity-50 cursor-not-allowed pointer-events-none",
                      )}
                    >
                      <p className="text-sm font-black leading-tight">
                        {(() => {
                          const today = startOfDay(new Date());
                          if (isBefore(selectedDate, today)) return 0;
                          const takenSlotStartTimes = new Set(
                            appointments
                              .filter((a) => a.status !== "cancelled")
                              .map((a) => a.startTime),
                          );
                          const isSelectedToday = isSameDay(
                            selectedDate,
                            new Date(),
                          );
                          const currentTimeStr = format(now, "HH:mm");
                          return slots.filter((s) => {
                            const isPastSlot =
                              isSelectedToday && s <= currentTimeStr;
                            return (
                              !takenSlotStartTimes.has(s) &&
                              !isPastSlot &&
                              !lockedSlots.some((l) => l.startTime === s)
                            );
                          }).length;
                        })()}{" "}
                        slot
                      </p>
                      <p
                        className={cn(
                          "text-[10px] uppercase font-bold tracking-widest",
                          overviewTab === "empty"
                            ? "text-amber-900"
                            : "text-yellow-600",
                        )}
                      >
                        Còn trống
                      </p>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 min-h-[120px]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${format(selectedDate, "yyyy-MM-dd")}-${overviewTab}`}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="col-span-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                    >
                      {(() => {
                        const today = startOfDay(new Date());
                        const isPastDay = isBefore(selectedDate, today);
                        const isSelectedToday = isSameDay(
                          selectedDate,
                          new Date(),
                        );
                        const currentTimeStr = format(now, "HH:mm");

                        // All active appointments on a past day are considered past
                        const pastApps = appointments.filter(
                          (a) =>
                            a.status === "active" &&
                            (isPastDay ||
                              (isSelectedToday &&
                                (a.endTime || "23:59") <= currentTimeStr)),
                        );
                        // Active apps only exist on today or future
                        const activeApps = appointments.filter(
                          (a) =>
                            a.status === "active" &&
                            !isPastDay &&
                            (!isSelectedToday ||
                              (a.endTime || "23:59") > currentTimeStr),
                        );
                        // Cancelled apps
                        const cancelledApps = appointments.filter(
                          (a) =>
                            a.status === "cancelled" &&
                            a.cancelledByAdmin &&
                            !isPastDay &&
                            (!isSelectedToday ||
                              (a.endTime || "23:59") > currentTimeStr),
                        );

                        if (overviewTab === "past") {
                          if (pastApps.length === 0)
                            return (
                              <div className="col-span-full py-12 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                  Không có lịch hẹn nào đã kết thúc trong ngày
                                  này
                                </p>
                              </div>
                            );

                          return (
                            <div className="col-span-full space-y-10">
                              {(currentDayConfig?.businessHours || businessHours).map((range, bIdx) => {
                                const rangeApps = pastApps
                                  .filter((a) => {
                                    const time = parseInt(a.startTime.split(":")[0]) + parseInt(a.startTime.split(":")[1] || "0") / 60;
                                    return (
                                      time >= range.start && time < range.end
                                    );
                                  })
                                  .sort((a, b) =>
                                    a.startTime.localeCompare(b.startTime),
                                  );

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
                                        <div
                                          key={app.id}
                                          className="p-4 rounded-2xl border bg-slate-50 border-slate-100 opacity-40 grayscale flex items-start justify-between gap-4"
                                        >
                                          <div className="flex items-start gap-4 overflow-hidden w-full">
                                            <div className="px-3 py-2 rounded-xl bg-slate-200 text-slate-500 font-mono text-sm font-black shrink-0">
                                              {app.startTime}
                                            </div>
                                            <div className="overflow-hidden flex-1">
                                              <h5 className="font-bold truncate leading-tight text-slate-500">
                                                {app.clientName}
                                              </h5>
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

                        if (overviewTab === "active") {
                          const displayList = [...activeApps, ...cancelledApps];
                          if (displayList.length === 0)
                            return (
                              <div className="col-span-full py-12 border-2 border-dashed border-slate-100 rounded-3xl flex flex-col items-center justify-center text-center bg-slate-50/20">
                                <CalendarDays
                                  size={24}
                                  className="text-slate-200 mb-3"
                                />
                                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                                  Hiện không có lịch hẹn mới
                                </p>
                              </div>
                            );

                          return (
                            <div className="col-span-full space-y-10">
                              {(currentDayConfig?.businessHours || businessHours).map((range, bIdx) => {
                                const rangeApps = displayList
                                  .filter((a) => {
                                    const time = parseInt(a.startTime.split(":")[0]) + parseInt(a.startTime.split(":")[1] || "0") / 60;
                                    return (
                                      time >= range.start && time < range.end
                                    );
                                  })
                                  .sort((a, b) => {
                                    const getPriority = (app: any) => {
                                      const isOngoing =
                                        isSelectedToday &&
                                        currentTimeStr >= app.startTime &&
                                        currentTimeStr <
                                          (app.endTime || "23:59");
                                      return isOngoing ? 0 : 1;
                                    };
                                    const pA = getPriority(a);
                                    const pB = getPriority(b);
                                    if (pA !== pB) return pA - pB;
                                    return a.startTime.localeCompare(
                                      b.startTime,
                                    );
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
                                        const isInProgress =
                                          isSelectedToday &&
                                          currentTimeStr >= app.startTime &&
                                          currentTimeStr <
                                            (app.endTime || "23:59");
                                        return (
                                          <div
                                            key={app.id}
                                            className={cn(
                                              "p-4 rounded-3xl border transition-all flex items-start justify-between gap-4 group relative",
                                              app.status === "cancelled"
                                                ? "bg-red-50/50 border-red-100 opacity-80"
                                                : isInProgress
                                                  ? "bg-yellow-50 border-yellow-400 shadow-lg shadow-yellow-100 ring-2 ring-yellow-200"
                                                  : "bg-white border-slate-100 shadow-sm hover:border-yellow-300 hover:bg-yellow-50/30",
                                            )}
                                          >
                                            <div className="flex items-start gap-4 overflow-hidden w-full">
                                              <div
                                                className={cn(
                                                  "px-3 py-2 rounded-2xl font-mono text-sm font-black shadow-lg shrink-0 text-center",
                                                  app.status === "cancelled"
                                                    ? "bg-red-400 text-white shadow-red-100"
                                                    : isInProgress
                                                      ? "bg-amber-950 text-yellow-400 shadow-amber-900/20 animate-pulse"
                                                      : "bg-yellow-400 text-amber-950 shadow-yellow-200/50",
                                                )}
                                              >
                                                {app.startTime}
                                              </div>
                                              <div className="overflow-hidden flex-1">
                                                <div className="flex items-center gap-2">
                                                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 whitespace-nowrap">
                                                    {isInProgress
                                                      ? "Đang diễn ra"
                                                      : "Học viên"}
                                                  </p>
                                                  {app.status ===
                                                    "cancelled" && (
                                                    <span className="text-[8px] font-black text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full uppercase tracking-tighter">
                                                      Đã hủy
                                                    </span>
                                                  )}
                                                </div>
                                                <h5
                                                  className={cn(
                                                    "font-bold truncate leading-tight",
                                                    app.status === "cancelled"
                                                      ? "text-slate-500 line-through"
                                                      : "text-slate-900",
                                                  )}
                                                >
                                                  {app.clientName}
                                                </h5>
                                                <p
                                                  className={cn(
                                                    "text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 mt-1",
                                                    isInProgress
                                                      ? "text-yellow-700"
                                                      : "text-yellow-600",
                                                  )}
                                                >
                                                  {app.guide}
                                                </p>
                                              </div>
                                            </div>
                                            {app.status !== "cancelled" && (
                                              <button
                                                onClick={() => {
                                                  setManageAppointment(app);
                                                  setShowManageModal(true);
                                                }}
                                                className="flex flex-col items-center gap-1 p-2 text-slate-300 hover:text-red-500 transition-all shrink-0 hover:bg-red-50 rounded-xl"
                                              >
                                                <Trash2 size={16} />
                                                <span className="text-[8px] font-black uppercase tracking-tighter">
                                                  Hủy
                                                </span>
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

                        if (overviewTab === "empty") {
                          const today = startOfDay(new Date());
                          if (isBefore(selectedDate, today))
                            return (
                              <div className="col-span-full py-12 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                  Không thể đặt lịch cho ngày đã qua
                                </p>
                              </div>
                            );

                          const takenSlotStartTimes = new Set(
                            appointments
                              .filter((a) => a.status !== "cancelled")
                              .map((a) => a.startTime),
                          );
                          const freeSlots = slots.filter((s) => {
                            const isPastSlot =
                              isSelectedToday && s <= currentTimeStr;
                            return (
                              !takenSlotStartTimes.has(s) &&
                              !isPastSlot &&
                              !lockedSlots.some((l) => l.startTime === s)
                            );
                          });

                          if (freeSlots.length === 0)
                            return (
                              <div className="col-span-full py-12 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                  Không còn slot trống trong ngày này
                                </p>
                              </div>
                            );

                          return (
                            <div className="col-span-full space-y-10">
                              {(currentDayConfig?.businessHours || businessHours).map((range, bIdx) => {
                                const rangeSlots = freeSlots.filter((s) => {
                                  const time = parseInt(s.split(":")[0]) + parseInt(s.split(":")[1] || "0") / 60;
                                  return (
                                    time >= range.start && time < range.end
                                  );
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
                                            setFormData({
                                              name: "",
                                              guide: "",
                                              question: "",
                                              password: "",
                                            });
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
                        <h3 className="text-xs font-black text-yellow-600 uppercase tracking-widest mb-1">
                          Hướng dẫn
                        </h3>
                        <p className="text-2xl font-heading font-black text-slate-900 leading-none">
                          3 BƯỚC ĐẶT LỊCH
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-slate-500 font-medium leading-relaxed">
                      Chỉ mất 1 phút để kết nối. Vui lòng thực hiện theo các
                      bước bên phải để đảm bảo lịch hẹn được ghi nhận thành
                      công.
                    </p>

                    <div className="pt-6 border-t border-slate-100 space-y-4">
                      <div className="flex items-center gap-3">
                        <CheckCircle2
                          size={18}
                          className="text-green-500 shrink-0"
                        />
                        <p className="text-xs font-bold text-slate-600 italic">
                          Lịch hẹn sẽ được gửi xác nhận ngay sau khi lưu.
                        </p>
                      </div>
                      <div className="bg-yellow-50 p-4 rounded-2xl border border-yellow-100 space-y-2">
                        <p className="text-[10px] font-black text-yellow-700 uppercase tracking-widest flex items-center gap-2">
                          Lưu ý quan trọng
                        </p>
                        <p className="text-[11px] text-yellow-800 font-medium leading-normal">
                          - Mỗi mã PIN là duy nhất để bảo mật lịch của bạn.
                          <br />- Vui lòng kiểm tra kỹ khung giờ "Sáng" hoặc
                          "Chiều" trước khi chọn.
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          window.open(
                            "https://youtube.com/shorts/Hdg8yxv2BqM",
                            "_blank",
                          )
                        }
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
                      <div className="absolute -top-3 -left-3 w-8 h-8 bg-white border-2 border-yellow-400 rounded-full flex items-center justify-center text-sm font-black text-yellow-600 shadow-sm">
                        1
                      </div>
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 mb-4 shadow-sm group-hover:text-yellow-500 transition-colors">
                        <CalendarIcon size={20} />
                      </div>
                      <h4 className="font-black text-slate-900 text-sm mb-2 uppercase tracking-tight">
                        Chọn ngày
                      </h4>
                      <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                        Sử dụng nút mũi tên hoặc biểu tượng lịch ở trên để chọn
                        ngày muốn đặt.
                      </p>
                    </div>

                    {/* Step 2 */}
                    <div className="relative p-6 bg-slate-50 rounded-3xl border border-slate-100 hover:border-yellow-300 transition-colors group">
                      <div className="absolute -top-3 -left-3 w-8 h-8 bg-white border-2 border-yellow-400 rounded-full flex items-center justify-center text-sm font-black text-yellow-600 shadow-sm">
                        2
                      </div>
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 mb-4 shadow-sm group-hover:text-yellow-500 transition-colors font-black uppercase text-[10px]">
                        Slot
                      </div>
                      <h4 className="font-black text-slate-900 text-sm mb-2 uppercase tracking-tight">
                        Tìm khung giờ
                      </h4>
                      <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                        Nhấn nút "ĐẶT LỊCH" để xem các khung giờ "Còn trống"
                        (màu vàng nhạt).
                      </p>
                    </div>

                    {/* Step 3 */}
                    <div className="relative p-6 bg-slate-50 rounded-3xl border border-slate-100 hover:border-yellow-300 transition-colors group">
                      <div className="absolute -top-3 -left-3 w-8 h-8 bg-white border-2 border-yellow-400 rounded-full flex items-center justify-center text-sm font-black text-yellow-600 shadow-sm">
                        3
                      </div>
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 mb-4 shadow-sm group-hover:text-yellow-500 transition-colors">
                        <CheckCircle2 size={20} />
                      </div>
                      <h4 className="font-black text-slate-900 text-sm mb-2 uppercase tracking-tight">
                        Xác nhận
                      </h4>
                      <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                        Chọn giờ, điền thông tin & Mã PIN để hoàn tất quá trình
                        kết nối.
                      </p>
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
                  <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                    Quản trị hệ thống
                  </h2>
                  <p className="text-slate-500 mt-1 font-medium">
                    {format(selectedDate, "EEEE, d MMMM yyyy", { locale: vi })}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  {[
                    {
                      id: "appointments",
                      label: "Lịch hẹn",
                      icon: <CalendarDays size={16} />,
                      activeColor: "bg-blue-100 text-blue-700 border-blue-200",
                    },
                    {
                      id: "config",
                      label: "Cấu hình",
                      icon: <Clock size={16} />,
                      activeColor:
                        "bg-purple-100 text-purple-700 border-purple-200",
                    },
                    {
                      id: "cancelled",
                      label: "Hủy lịch",
                      icon: <Trash2 size={16} />,
                      activeColor: "bg-red-100 text-red-700 border-red-200",
                    },
                    {
                      id: "cvs",
                      label: "Quản lý CV",
                      icon: <FileText size={16} />,
                      activeColor:
                        "bg-green-100 text-green-700 border-green-200",
                    },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveAdminTab(tab.id as any)}
                      className={cn(
                        "flex items-center px-4 md:px-6 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border overflow-hidden",
                        activeAdminTab === tab.id
                          ? cn(
                              tab.activeColor,
                              "flex-1 md:flex-none justify-center gap-2 shadow-md",
                            )
                          : "bg-slate-50 border-slate-100 text-slate-500 hover:text-slate-700 hover:border-slate-200 hover:bg-slate-100 shadow-sm justify-center gap-0 md:gap-2 flex-none",
                      )}
                    >
                      <div className="flex-shrink-0">{tab.icon}</div>
                      <span
                        className={cn(
                          "transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden",
                          activeAdminTab === tab.id
                            ? "max-w-[200px] opacity-100"
                            : "max-w-0 opacity-0 md:max-w-[200px] md:opacity-100",
                        )}
                      >
                        {tab.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-12">
                {activeAdminTab === "config" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-8"
                  >
                    {/* Config Sub-tabs */}
                    <div className="flex bg-slate-100 p-1.5 rounded-[20px] max-w-sm">
                      <button
                        onClick={() => setConfigTab("schedule")}
                        className={cn(
                          "flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-[16px] transition-all",
                          configTab === "schedule"
                            ? "bg-white text-blue-700 shadow-sm"
                            : "text-slate-400 hover:text-slate-600",
                        )}
                      >
                        Lịch hẹn
                      </button>
                      <button
                        onClick={() => setConfigTab("passwords")}
                        className={cn(
                          "flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-[16px] transition-all",
                          configTab === "passwords"
                            ? "bg-white text-purple-700 shadow-sm"
                            : "text-slate-400 hover:text-slate-600",
                        )}
                      >
                        Mật khẩu
                      </button>
                    </div>

                    {configTab === "schedule" && (
                      <div className="space-y-8">
                        {/* 1. Khung mặc định (Global settings) */}
                        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-yellow-400 flex items-center justify-center text-amber-950">
                              <Settings size={20} />
                            </div>
                            <div>
                              <h3 className="text-lg font-black text-slate-900 tracking-tight">
                                Cấu hình mặc định
                              </h3>
                              <p className="text-xs text-slate-400 font-medium italic">
                                Áp dụng chung cho toàn bộ hệ thống
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
                            <div className="space-y-4">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                Khung giờ làm việc mặc định
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {businessHours.map((range, rbIdx) => (
                                  <div
                                    key={rbIdx}
                                    className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 group hover:border-yellow-400 transition-all"
                                  >
                                    <span className="text-[10px] text-slate-500 font-black uppercase w-12">
                                      {range.label}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <select
                                        value={range.start}
                                        onChange={(e) => {
                                          const newRanges = [...businessHours];
                                          newRanges[rbIdx].start = parseFloat(
                                            e.target.value,
                                          );
                                          updateSettings({
                                            businessHours: newRanges,
                                          });
                                        }}
                                        className="bg-white border border-slate-200 text-xs font-bold p-2 rounded-xl outline-none"
                                      >
                                        {getTimeOptions(
                                          range.label,
                                          slotDuration,
                                        ).map((val) => (
                                          <option key={val} value={val}>
                                            {formatTime(val)}
                                          </option>
                                        ))}
                                      </select>
                                      <span className="text-slate-300">→</span>
                                      <select
                                        value={range.end}
                                        onChange={(e) => {
                                          const newRanges = [...businessHours];
                                          newRanges[rbIdx].end = parseFloat(
                                            e.target.value,
                                          );
                                          updateSettings({
                                            businessHours: newRanges,
                                          });
                                        }}
                                        className="bg-white border border-slate-200 text-xs font-bold p-2 rounded-xl outline-none"
                                      >
                                        {getTimeOptions(
                                          range.label,
                                          slotDuration,
                                        ).map((val) => (
                                          <option key={val} value={val}>
                                            {formatTime(val)}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-8">
                              <div className="space-y-4">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                  Thời lượng mỗi phiên mặc định
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {[15, 20, 30].map((val) => (
                                    <button
                                      key={val}
                                      onClick={() =>
                                        updateSettings({ slotDuration: val })
                                      }
                                      className={cn(
                                        "px-6 py-3 rounded-2xl text-[11px] font-black transition-all border-2",
                                        slotDuration === val
                                          ? "bg-yellow-400 text-amber-950 border-yellow-400 shadow-xl shadow-yellow-100"
                                          : "bg-white text-slate-400 border-slate-100 hover:border-yellow-200",
                                      )}
                                    >
                                      {val} phút
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="space-y-4">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                  Thông báo trên trang chủ
                                </p>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={announcement}
                                    onChange={(e) =>
                                      setAnnouncement(e.target.value)
                                    }
                                    placeholder="Gửi lời chào hoặc thông báo đến học viên..."
                                    className="flex-1 px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-sm font-bold focus:bg-white focus:border-yellow-400 transition-all"
                                  />
                                  <button
                                    onClick={() =>
                                      updateSettings({ announcement })
                                    }
                                    className="px-6 py-3 bg-amber-950 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg"
                                  >
                                    Lưu
                                  </button>
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
                                <h3 className="text-lg font-black text-slate-900 tracking-tight">
                                  Tổng quan lịch
                                </h3>
                                <p className="text-xs text-slate-400 font-medium italic">
                                  Chọn ngày để tùy chỉnh khung giờ riêng
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                              <button
                                onClick={() =>
                                  setCurrentMonth(addMonths(currentMonth, -1))
                                }
                                className="p-3 hover:bg-white rounded-xl text-slate-500 shadow-sm transition-all"
                              >
                                <ChevronLeft size={18} />
                              </button>
                              <span className="min-w-[140px] text-center font-black text-sm text-slate-900 uppercase tracking-widest tabular-nums">
                                {format(currentMonth, "MMMM yyyy", {
                                  locale: vi,
                                })}
                              </span>
                              <button
                                onClick={() =>
                                  setCurrentMonth(addMonths(currentMonth, 1))
                                }
                                className="p-3 hover:bg-white rounded-xl text-slate-500 shadow-sm transition-all"
                              >
                                <ChevronRight size={18} />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-7 gap-2 max-w-2xl mx-auto">
                            {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map(
                              (d) => (
                                <div
                                  key={d}
                                  className="text-[11px] font-black text-slate-300 text-center uppercase py-3"
                                >
                                  {d}
                                </div>
                              ),
                            )}
                            {(() => {
                              const start = startOfMonth(currentMonth);
                              const end = endOfMonth(currentMonth);
                              const days = eachDayOfInterval({ start, end });
                              const firstDay = getDay(start);
                              const padding = firstDay === 0 ? 6 : firstDay - 1;
                              const result = [];
                              for (let i = 0; i < padding; i++)
                                result.push(<div key={`pad-${i}`} />);
                              days.forEach((day) => {
                                const dateStr = format(day, "yyyy-MM-dd");
                                const isSelected = isSameDay(day, selectedDate);
                                const hasConfig = allDayConfigs[dateStr];
                                result.push(
                                  <button
                                    key={dateStr}
                                    onClick={() => setSelectedDate(day)}
                                    className={cn(
                                      "h-12 w-full rounded-2xl text-xs font-black flex flex-col items-center justify-center transition-all relative group",
                                      isSelected
                                        ? "bg-amber-950 text-white shadow-xl scale-110 z-10"
                                        : hasConfig
                                          ? "bg-yellow-400 text-amber-950 shadow-md"
                                          : "hover:bg-slate-50 text-slate-600 border border-transparent hover:border-slate-100",
                                    )}
                                  >
                                    {format(day, "d")}
                                    {hasConfig && !isSelected && (
                                      <div className="absolute bottom-1.5 w-1 h-1 rounded-full bg-amber-950/20" />
                                    )}
                                  </button>,
                                );
                              });
                              return result;
                            })()}
                          </div>

                          <div className="flex flex-wrap gap-6 justify-center mt-10 pt-8 border-t border-slate-50">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-yellow-400" />
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                Đã có cấu hình riêng
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-amber-950" />
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                Ngày đang chọn
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-slate-100" />
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                Mặc định
                              </span>
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
                                <h3 className="text-lg font-black text-slate-900 tracking-tight">
                                  Tùy chỉnh ngày{" "}
                                  {format(selectedDate, "dd/MM/yyyy")}
                                </h3>
                                <div className="flex items-center gap-2">
                                  <p className="text-xs text-slate-500 font-medium italic">
                                    Ghi đè cấu hình mặc định cho ngày này
                                  </p>
                                  <span
                                    className={cn(
                                      "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter",
                                      currentDayConfig
                                        ? "bg-yellow-100 text-yellow-700"
                                        : "bg-slate-100 text-slate-400",
                                    )}
                                  >
                                    {currentDayConfig
                                      ? "Đang dùng cấu hình riêng"
                                      : "Đang dùng mặc định"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-4 cursor-pointer bg-white px-6 py-3 rounded-2xl border border-amber-200 shadow-sm hover:border-yellow-400 transition-all group">
                                <div
                                  className={cn(
                                    "w-10 h-5 rounded-full transition-all relative flex items-center",
                                    editingDayConfig
                                      ? "bg-yellow-400"
                                      : "bg-slate-200",
                                  )}
                                >
                                  <div
                                    className={cn(
                                      "absolute w-3.5 h-3.5 bg-white rounded-full transition-all shadow-sm",
                                      editingDayConfig
                                        ? "left-[22px]"
                                        : "left-[3px]",
                                    )}
                                  />
                                </div>
                                <input
                                  type="checkbox"
                                  className="hidden"
                                  checked={!!editingDayConfig}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setEditingDayConfig(
                                        currentDayConfig || {
                                          morningActive: true,
                                          afternoonActive: true,
                                          duration: slotDuration,
                                          businessHours: businessHours,
                                        },
                                      );
                                    } else {
                                      if (currentDayConfig) {
                                        if (
                                          confirm(
                                            "Về lại mặc định cho ngày này? Mọi tùy chỉnh sẽ bị xóa.",
                                          )
                                        ) {
                                          deleteDoc(
                                            doc(
                                              db,
                                              "dayConfigs",
                                              format(
                                                selectedDate,
                                                "yyyy-MM-dd",
                                              ),
                                            ),
                                          );
                                          setEditingDayConfig(null);
                                        }
                                      } else {
                                        setEditingDayConfig(null);
                                      }
                                    }
                                  }}
                                />
                                <span className="text-xs font-black text-slate-700 uppercase tracking-widest leading-none">
                                  Cấu hình riêng
                                </span>
                              </label>

                              {editingDayConfig &&
                                JSON.stringify(editingDayConfig) !==
                                  JSON.stringify(
                                    currentDayConfig || {
                                      morningActive: true,
                                      afternoonActive: true,
                                      duration: slotDuration,
                                      businessHours: businessHours,
                                    },
                                  ) && (
                                  <button
                                    onClick={() =>
                                      updateDayConfig(editingDayConfig)
                                    }
                                    className="px-6 py-3 bg-amber-950 text-white text-[10px] font-black rounded-2xl border border-amber-950 uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-amber-900/20 flex items-center gap-2"
                                  >
                                    <Plus
                                      size={14}
                                      className="text-yellow-400"
                                    />
                                    {currentDayConfig
                                      ? "Lưu thay đổi"
                                      : "Áp dụng ngay"}
                                  </button>
                                )}
                            </div>
                          </div>

                          <div
                            className={cn(
                              "grid grid-cols-1 xl:grid-cols-2 gap-12 transition-all duration-300",
                              !editingDayConfig &&
                                "opacity-30 pointer-events-none filter grayscale saturate-0",
                            )}
                          >
                            <div className="space-y-4">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                Trạng thái hoạt động
                              </p>
                              <div className="flex gap-4">
                                <label className="flex-1 flex items-center gap-4 cursor-pointer p-4 bg-white rounded-2xl border border-amber-100 hover:border-yellow-400 transition-all shadow-sm">
                                  <input
                                    type="checkbox"
                                    checked={
                                      editingDayConfig?.morningActive ?? true
                                    }
                                    onChange={(e) =>
                                      setEditingDayConfig({
                                        ...editingDayConfig,
                                        morningActive: e.target.checked,
                                      })
                                    }
                                    className="w-6 h-6 rounded-lg text-amber-950 focus:ring-yellow-400"
                                  />
                                  <span className="text-xs font-black text-slate-700 uppercase tracking-widest">
                                    Mở Buổi Sáng
                                  </span>
                                </label>
                                <label className="flex-1 flex items-center gap-4 cursor-pointer p-4 bg-white rounded-2xl border-amber-100 hover:border-yellow-400 transition-all shadow-sm">
                                  <input
                                    type="checkbox"
                                    checked={
                                      editingDayConfig?.afternoonActive ?? true
                                    }
                                    onChange={(e) =>
                                      setEditingDayConfig({
                                        ...editingDayConfig,
                                        afternoonActive: e.target.checked,
                                      })
                                    }
                                    className="w-6 h-6 rounded-lg text-amber-950 focus:ring-yellow-400"
                                  />
                                  <span className="text-xs font-black text-slate-700 uppercase tracking-widest">
                                    Mở Buổi Chiều
                                  </span>
                                </label>
                              </div>
                            </div>

                            <div className="space-y-4">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                Thời lượng phiên riêng ngày này
                              </p>
                              <div className="flex gap-3">
                                {[15, 20, 30].map((val) => (
                                  <button
                                    key={val}
                                    onClick={() =>
                                      setEditingDayConfig({
                                        ...editingDayConfig,
                                        duration: val,
                                      })
                                    }
                                    className={cn(
                                      "px-6 py-3 rounded-2xl text-[11px] font-black transition-all border-2",
                                      (editingDayConfig?.duration ??
                                        slotDuration) === val
                                        ? "bg-amber-950 text-white border-amber-950"
                                        : "bg-white text-slate-400 border-amber-50 hover:border-amber-200",
                                    )}
                                  >
                                    {val} phút
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="xl:col-span-2 space-y-4">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                Khung giờ làm việc tùy chỉnh
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {(
                                  editingDayConfig?.businessHours ||
                                  businessHours
                                ).map((range, rbIdx) => (
                                  <div
                                    key={rbIdx}
                                    className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-amber-100"
                                  >
                                    <span className="text-[10px] text-amber-900 font-black uppercase w-12">
                                      {range.label}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <select
                                        value={range.start}
                                        onChange={(e) => {
                                          const newRanges = [
                                            ...(editingDayConfig?.businessHours ||
                                              businessHours),
                                          ];
                                          newRanges[rbIdx] = {
                                            ...newRanges[rbIdx],
                                            start: parseFloat(e.target.value),
                                          };
                                          setEditingDayConfig({
                                            ...editingDayConfig,
                                            businessHours: newRanges,
                                          });
                                        }}
                                        className="bg-slate-50 border border-slate-100 text-xs font-bold p-2 rounded-xl outline-none"
                                      >
                                        {getTimeOptions(
                                          range.label,
                                          editingDayConfig?.duration ||
                                            slotDuration,
                                        ).map((val) => (
                                          <option key={val} value={val}>
                                            {formatTime(val)}
                                          </option>
                                        ))}
                                      </select>
                                      <span className="text-slate-300">→</span>
                                      <select
                                        value={range.end}
                                        onChange={(e) => {
                                          const newRanges = [
                                            ...(editingDayConfig?.businessHours ||
                                              businessHours),
                                          ];
                                          newRanges[rbIdx] = {
                                            ...newRanges[rbIdx],
                                            end: parseFloat(e.target.value),
                                          };
                                          setEditingDayConfig({
                                            ...editingDayConfig,
                                            businessHours: newRanges,
                                          });
                                        }}
                                        className="bg-slate-50 border border-slate-100 text-xs font-bold p-2 rounded-xl outline-none"
                                      >
                                        {getTimeOptions(
                                          range.label,
                                          editingDayConfig?.duration ||
                                            slotDuration,
                                        ).map((val) => (
                                          <option key={val} value={val}>
                                            {formatTime(val)}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {configTab === "passwords" && (
                      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-700">
                            <Lock size={20} />
                          </div>
                          <div>
                            <h3 className="text-lg font-black text-slate-900 tracking-tight">
                              Thiết lập Mật khẩu Quyền truy cập
                            </h3>
                            <p className="text-xs text-slate-400 font-medium italic">
                              Thay đổi mật khẩu cho từng vai trò quản lý CV
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          {/* Kế toán */}
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                              Kế toán
                            </label>
                            <input
                              type="text"
                              value={editingPasswords.accountant}
                              onChange={(e) =>
                                setEditingPasswords({
                                  ...editingPasswords,
                                  accountant: e.target.value,
                                })
                              }
                              className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm tracking-wide"
                              placeholder="Mật khẩu kế toán"
                            />
                          </div>

                          {/* Duyệt App */}
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                              Duyệt App
                            </label>
                            <input
                              type="text"
                              value={editingPasswords.app_approver}
                              onChange={(e) =>
                                setEditingPasswords({
                                  ...editingPasswords,
                                  app_approver: e.target.value,
                                })
                              }
                              className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm tracking-wide"
                              placeholder="Mật khẩu duyệt app"
                            />
                          </div>

                          {/* Học tập */}
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                              Học tập
                            </label>
                            <input
                              type="text"
                              value={editingPasswords.learning}
                              onChange={(e) =>
                                setEditingPasswords({
                                  ...editingPasswords,
                                  learning: e.target.value,
                                })
                              }
                              className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm tracking-wide"
                              placeholder="Mật khẩu học tập"
                            />
                          </div>

                          {/* Xóa CV */}
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                              Xóa App
                            </label>
                            <input
                              type="text"
                              value={editingPasswords.delete}
                              onChange={(e) =>
                                setEditingPasswords({
                                  ...editingPasswords,
                                  delete: e.target.value,
                                })
                              }
                              className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-red-400 transition-all font-bold text-sm tracking-wide"
                              placeholder="Mật khẩu xóa app"
                            />
                          </div>
                        </div>

                        <div className="pt-8 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                          <div className="space-y-2 flex-1">
                            <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest px-1">
                              Mật khẩu xác nhận Admin
                            </label>
                            <input
                              type="password"
                              value={adminSetupPassword}
                              onChange={(e) =>
                                setAdminSetupPassword(e.target.value)
                              }
                              className="w-full max-w-[200px] px-5 py-3 bg-amber-50 border border-amber-200 rounded-2xl outline-none focus:bg-white focus:border-amber-400 transition-all font-black text-sm tracking-widest"
                              placeholder="****"
                            />
                          </div>
                          <button
                            onClick={async () => {
                              if (adminSetupPassword !== "6868") {
                                setChromeAlert(
                                  "Mật khẩu Admin không chính xác!",
                                );
                                return;
                              }
                              try {
                                await setDoc(
                                  doc(db, "settings", "global"),
                                  { passwords: editingPasswords },
                                  { merge: true },
                                );
                                setAdminSetupPassword("");
                                setChromeAlert("Lưu mật khẩu thành công!");
                              } catch (error) {
                                setChromeAlert(
                                  "Có lỗi xảy ra, vui lòng thử lại.",
                                );
                              }
                            }}
                            className="w-full sm:w-auto px-8 py-4 bg-amber-950 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-black transition-all shadow-xl shadow-amber-900/20 active:scale-95"
                          >
                            Lưu Thay Đổi
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {activeAdminTab === "appointments" && (
                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-12"
                  >
                    <div className="flex items-center justify-between px-2">
                      <div className="flex items-center gap-4">
                        <CalendarDays className="text-yellow-500" />
                        <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                          Timeline lịch hẹn trong ngày
                        </h3>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-200">
                          <div className="px-4 font-black text-sm text-slate-900 tabular-nums border-r border-slate-100 mr-1">
                            {format(selectedDate, "dd/MM/yyyy")}
                          </div>
                          <div className="flex items-center">
                            <button
                              onClick={() =>
                                setSelectedDate(addDays(selectedDate, -1))
                              }
                              className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400"
                              title="Ngày trước"
                            >
                              <ChevronLeft size={16} />
                            </button>
                            <button
                              onClick={() =>
                                setSelectedDate(addDays(selectedDate, 1))
                              }
                              className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400"
                              title="Ngày mai"
                            >
                              <ChevronRight size={18} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 relative">
                      <div className="absolute left-[39px] top-0 bottom-0 w-px bg-slate-100" />

                      {(() => {
                        const isSelectedToday = isSameDay(
                          selectedDate,
                          new Date(),
                        );
                        const currentTimeStr = format(now, "HH:mm");

                        const filteredApps = [...appointments]
                          .filter((a) => (a as any).status !== "cancelled")
                          .filter((a) => {
                            if (!isSelectedToday) return true;
                            // Hide if end time is past
                            return (a.endTime || "23:59") > currentTimeStr;
                          })
                          .sort((a, b) =>
                            a.startTime.localeCompare(b.startTime),
                          );

                        if (filteredApps.length === 0)
                          return (
                            <div className="bg-slate-50 rounded-[40px] p-24 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
                              <CalendarDays
                                size={48}
                                className="text-slate-200 mb-4"
                              />
                              <h3 className="text-lg font-bold text-slate-400 italic">
                                Hôm nay chưa có lịch hẹn
                              </h3>
                            </div>
                          );

                        return filteredApps.map((app, idx) => {
                          const isInProgress =
                            isSelectedToday &&
                            currentTimeStr >= app.startTime &&
                            currentTimeStr < (app.endTime || "23:59");

                          return (
                            <div
                              key={app.id}
                              className="flex items-start gap-8 relative group"
                            >
                              <div className="w-20 pt-4 flex flex-col items-center">
                                <span
                                  className={cn(
                                    "text-lg font-black tabular-nums transition-colors",
                                    isInProgress
                                      ? "text-yellow-600"
                                      : "text-slate-400",
                                  )}
                                >
                                  {app.startTime}
                                </span>
                                {isInProgress && (
                                  <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse mt-2" />
                                )}
                                <div className="h-4" />
                              </div>
                              <div
                                className={cn(
                                  "flex-1 p-6 rounded-3xl border transition-all flex items-center justify-between",
                                  isInProgress
                                    ? "bg-yellow-50 border-yellow-200 shadow-lg shadow-yellow-100/50 border-l-[6px] border-l-yellow-400"
                                    : "bg-white border-slate-100 shadow-sm hover:shadow-xl hover:border-yellow-200 border-l-4 border-l-slate-200",
                                )}
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-3">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                      Học viên
                                    </p>
                                    {isInProgress && (
                                      <span className="px-2 py-0.5 bg-yellow-400 text-amber-950 text-[8px] font-black rounded-full uppercase tracking-tighter animate-pulse">
                                        Đang diễn ra
                                      </span>
                                    )}
                                  </div>
                                  <h4 className="text-xl font-black text-slate-900 tracking-tight">
                                    {app.clientName}
                                  </h4>
                                  <div className="flex items-center gap-8 text-[11px] font-medium text-slate-500 pt-1">
                                    <span className="flex items-center gap-1.5">
                                      <User
                                        size={14}
                                        className="text-yellow-600"
                                      />{" "}
                                      {app.guide}
                                    </span>
                                    <span className="flex items-center gap-1.5 italic">
                                      <MessageSquare
                                        size={14}
                                        className="text-yellow-600"
                                      />{" "}
                                      {app.question}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => {
                                      setManageAppointment(app);
                                      setShowManageModal(true);
                                      handleEditManageTimeSetup(app);
                                    }}
                                    title="Chỉnh sửa thời gian"
                                    className="p-4 text-slate-300 hover:text-yellow-600 bg-slate-50 rounded-[24px] opacity-0 group-hover:opacity-100 transition-all hover:scale-105 active:scale-95"
                                  >
                                    <Edit3 size={20} />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setManageAppointment(app);
                                      setShowManageModal(true);
                                    }}
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

                {activeAdminTab === "cancelled" && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-8"
                  >
                    <div className="flex items-center justify-between px-2">
                      <div className="flex items-center gap-4">
                        <Trash2 className="text-red-500" />
                        <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                          Danh sách lịch đã gỡ bỏ
                        </h3>
                      </div>
                      <span className="px-4 py-1.5 bg-red-100 text-red-700 text-[10px] font-black rounded-full border border-red-200 uppercase tracking-widest shadow-sm">
                        Tối đa 10 gần đây
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {(() => {
                        if (recentCancelled.length === 0)
                          return (
                            <div className="py-24 text-center bg-white rounded-[40px] border border-slate-100">
                              <p className="text-slate-400 font-bold italic text-lg">
                                Chưa có lịch hẹn nào bị hủy
                              </p>
                            </div>
                          );

                        return recentCancelled.map((app) => (
                          <div
                            key={app.id}
                            className="bg-slate-50/50 p-8 rounded-3xl border border-dashed border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 opacity-80 group hover:opacity-100 transition-all"
                          >
                            <div className="flex items-center gap-8">
                              <div className="text-center shrink-0">
                                <span className="text-2xl font-black text-slate-300 tabular-nums">
                                  {app.startTime}
                                </span>
                                <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">
                                  {app.date}
                                </p>
                              </div>
                              <div className="h-12 w-px bg-slate-200" />
                              <div className="space-y-1">
                                <h4 className="font-bold text-slate-400 line-through text-lg">
                                  {app.clientName}
                                </h4>
                                <p className="text-xs text-red-400 font-bold italic">
                                  Lý do: {app.cancellationReason || "Admin hủy"}
                                </p>
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
                                onClick={async () => {
                                  if (confirm("Xóa vĩnh viễn?"))
                                    await deleteDoc(
                                      doc(db, "appointments", app.id),
                                    );
                                }}
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

                {activeAdminTab === "cvs" && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-8"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2 mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-yellow-100 rounded-2xl flex items-center justify-center text-yellow-600 shadow-sm border border-yellow-200">
                          <FileText size={24} />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                            Quản lý CV Học viên
                          </h3>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                              Tổng: {cvs.length}
                            </span>
                            <span className="w-1 h-1 bg-slate-200 rounded-full" />
                            <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">
                              Chờ Duyệt:{" "}
                              {cvs.filter((c) => c.status === "pending").length}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          title="Học tập"
                          onClick={() => {
                            setAdminCvTab(
                              adminCvTab === "learning" ? "status" : "learning",
                            );
                            setSelectedAppCvIds([]);
                            setSelectedDeleteCvIds([]);
                          }}
                          className={cn(
                            "relative p-3 flex items-center justify-center rounded-xl transition-all border border-transparent bg-slate-50 shadow-sm",
                            adminCvTab === "learning"
                              ? "bg-purple-50/50 border text-purple-600 border-purple-200"
                              : "text-slate-400 hover:text-slate-600 hover:bg-slate-100",
                          )}
                        >
                          <GraduationCap size={18} strokeWidth={2.5} />
                          {(() => {
                            const newReenrollCount = cvs.filter(
                              (c) =>
                                c.type === "reenroll" &&
                                !courses.some((course) =>
                                  course.studentIds.includes(c.id),
                                ),
                            ).length;
                            if (newReenrollCount === 0) return null;
                            return (
                              <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-sm border-2 border-white z-10">
                                {newReenrollCount > 99
                                  ? "99+"
                                  : newReenrollCount}
                              </span>
                            );
                          })()}
                        </button>

                        <div className="relative">
                          <button
                            title="Kiểm duyệt"
                            onClick={() =>
                              setIsApprovalMenuOpen(!isApprovalMenuOpen)
                            }
                            className={cn(
                              "relative p-3 flex items-center justify-center rounded-xl transition-all border border-transparent bg-slate-50 shadow-sm",
                              ["accountant", "app_approver", "delete"].includes(
                                adminCvTab,
                              )
                                ? "bg-blue-50/50 border text-blue-600 border-blue-200"
                                : "text-slate-400 hover:text-slate-600 hover:bg-slate-100",
                            )}
                          >
                            <MousePointerClick size={18} strokeWidth={2.5} />
                            {(() => {
                              const pendingCount = cvs.filter(
                                (c) =>
                                  cvFilterMapping.pending(c) &&
                                  c.type !== "reenroll",
                              ).length;
                              if (pendingCount === 0) return null;
                              return (
                                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-sm border-2 border-white z-10">
                                  {pendingCount > 99 ? "99+" : pendingCount}
                                </span>
                              );
                            })()}
                          </button>

                          <AnimatePresence>
                            {isApprovalMenuOpen && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setIsApprovalMenuOpen(false)}
                                />
                                <motion.div
                                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                  className="absolute left-0 sm:right-0 sm:left-auto top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 z-20 overflow-hidden"
                                >
                                  <div className="p-2 space-y-1">
                                    {[
                                      {
                                        id: "accountant",
                                        label: "Kế toán",
                                        icon: (
                                          <CircleDollarSign
                                            size={16}
                                            strokeWidth={2.5}
                                          />
                                        ),
                                      },
                                      {
                                        id: "app_approver",
                                        label: "Duyệt App",
                                        icon: (
                                          <Smartphone
                                            size={16}
                                            strokeWidth={2.5}
                                          />
                                        ),
                                      },
                                      {
                                        id: "delete",
                                        label: "Xóa CV",
                                        icon: (
                                          <Trash2 size={16} strokeWidth={2.5} />
                                        ),
                                      },
                                    ].map((tab) => (
                                      <button
                                        key={tab.id}
                                        onClick={() => {
                                          setAdminCvTab(tab.id as any);
                                          setIsApprovalMenuOpen(false);
                                          setSelectedAppCvIds([]);
                                          setSelectedDeleteCvIds([]);
                                        }}
                                        className={cn(
                                          "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-xs font-bold uppercase tracking-wide transition-colors",
                                          adminCvTab === tab.id
                                            ? "bg-blue-50 text-blue-700"
                                            : "text-slate-600 hover:bg-slate-50",
                                        )}
                                      >
                                        <div
                                          className={
                                            adminCvTab === tab.id
                                              ? "text-blue-600"
                                              : "text-slate-400"
                                          }
                                        >
                                          {tab.icon}
                                        </div>
                                        {tab.label}
                                      </button>
                                    ))}
                                  </div>
                                </motion.div>
                              </>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      {adminCvTab !== "learning" && (
                        <div className="flex bg-white p-1.5 rounded-full border border-slate-200 shadow-sm sticky top-[4.5rem] z-10 overflow-x-auto hide-scrollbar">
                          <div className="flex w-full min-w-max">
                            {[
                              { id: "all", label: "Tất cả CV" },
                              { id: "pending", label: "Chờ duyệt" },
                              { id: "processing", label: "Đang duyệt" },
                              { id: "completed", label: "Hoàn thành" },
                              { id: "rejected", label: "Từ chối" },
                            ].map((tab) => {
                              const count =
                                tab.id === "all"
                                  ? cvs.length
                                  : cvs.filter((c) =>
                                      cvFilterMapping[
                                        tab.id as keyof typeof cvFilterMapping
                                      ](c),
                                    ).length;
                              return (
                                <button
                                  key={tab.id}
                                  onClick={() =>
                                    setStatusSubFilter(tab.id as any)
                                  }
                                  className={cn(
                                    "flex flex-1 items-center justify-center gap-2 px-6 py-3 rounded-full text-xs font-bold uppercase transition-all whitespace-nowrap",
                                    statusSubFilter === tab.id
                                      ? "bg-yellow-100 text-yellow-700 shadow-md border border-yellow-200"
                                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-50/50",
                                  )}
                                >
                                  <span>{tab.label}</span>
                                  <span
                                    className={cn(
                                      "py-0.5 px-2 rounded-full text-[10px] font-black leading-none",
                                      statusSubFilter === tab.id
                                        ? "bg-yellow-200"
                                        : "bg-slate-200/60",
                                    )}
                                  >
                                    {count}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {adminCvTab !== "status" &&
                      !unlockedRoles[
                        adminCvTab as keyof typeof unlockedRoles
                      ] ? (
                        <div className="py-24 text-center bg-white rounded-[40px] border border-slate-100 opacity-50 blur-[2px] pointer-events-none select-none">
                          <Lock
                            size={48}
                            className="mx-auto text-slate-200 mb-4"
                          />
                          <p className="text-xl font-bold text-slate-300 uppercase tracking-widest">
                            Nội dung đã khóa
                          </p>
                        </div>
                      ) : (
                        <>
                          {adminCvTab === "app_approver" &&
                            statusSubFilter === "processing" && (
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() =>
                                    setCvActionModal({
                                      show: true,
                                      cvId: "",
                                      type: "bulkApproveApp",
                                    })
                                  }
                                  disabled={selectedAppCvIds.length === 0}
                                  className="flex-1 max-w-xs flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 transition-all shadow-lg uppercase tracking-widest disabled:opacity-50 disabled:grayscale shadow-blue-100"
                                >
                                  <Check size={16} />
                                  Duyệt App ({selectedAppCvIds.length})
                                </button>
                                <button
                                  onClick={() =>
                                    setCvActionModal({
                                      show: true,
                                      cvId: "",
                                      type: "bulkRejectApp",
                                    })
                                  }
                                  disabled={selectedAppCvIds.length === 0}
                                  className="flex-1 max-w-xs flex items-center justify-center gap-2 px-6 py-3 bg-red-100 text-red-600 rounded-xl text-xs font-black hover:bg-red-200 transition-all uppercase tracking-widest border border-red-200 disabled:opacity-50"
                                >
                                  <Smartphone size={16} />
                                  Từ chối
                                </button>
                              </div>
                            )}

                          {adminCvTab === "delete" && (
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() =>
                                  setCvActionModal({
                                    show: true,
                                    cvId: "",
                                    type: "bulkDeleteCv",
                                  })
                                }
                                disabled={selectedDeleteCvIds.length === 0}
                                className="flex-1 max-w-xs flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl text-xs font-black hover:bg-red-700 transition-all shadow-lg uppercase tracking-widest disabled:opacity-50 disabled:grayscale shadow-red-100"
                              >
                                <Trash2 size={16} />
                                Khẳng định Xóa vĩnh viễn (
                                {selectedDeleteCvIds.length})
                              </button>
                            </div>
                          )}

                          <div className="mt-8 mb-4 flex justify-end items-center gap-4">
                            <div className="flex flex-row items-center gap-3">
                              {adminCvTab === "learning" &&
                                !selectedCourseId && (
                                  <button
                                    onClick={() => {
                                      setCourseForm({
                                        name: "",
                                        start: "",
                                        end: "",
                                        closingDate: "",
                                        autoAddFromDate: "",
                                      });
                                      setEditingCourseId(null);
                                      setSelectedLearningCvIds([]);
                                      setShowCreateCourseModal(true);
                                    }}
                                    className="flex items-center justify-center p-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                                    title="Tạo khóa học mới"
                                  >
                                    <Plus size={18} strokeWidth={2.5} />
                                  </button>
                                )}
                              {/* Search Inline */}
                              <div className="relative flex items-center">
                                <AnimatePresence>
                                  {isAdminCvSearchVisible && (
                                    <motion.input
                                      initial={{ width: 0, opacity: 0 }}
                                      animate={{ width: 220, opacity: 1 }}
                                      exit={{ width: 0, opacity: 0 }}
                                      type="text"
                                      placeholder="Tìm tên, SĐT, Đồng hành..."
                                      value={adminCvSearchText}
                                      onChange={(e) =>
                                        setAdminCvSearchText(e.target.value)
                                      }
                                      className="absolute right-[calc(100%+8px)] top-0 h-full border border-slate-200 rounded-xl px-3 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 text-sm font-bold text-slate-800 placeholder:font-normal placeholder:text-slate-400 bg-white"
                                    />
                                  )}
                                </AnimatePresence>
                                <button
                                  onClick={() => {
                                    setIsAdminCvSearchVisible(
                                      !isAdminCvSearchVisible,
                                    );
                                    if (isAdminCvSearchVisible)
                                      setAdminCvSearchText("");
                                  }}
                                  className={cn(
                                    "flex items-center justify-center p-2.5 border rounded-xl transition-all shadow-sm focus:outline-none focus:ring-2 relative z-10",
                                    isAdminCvSearchVisible
                                      ? "bg-blue-600 text-white border-blue-600 focus:ring-blue-200"
                                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50 focus:ring-slate-100",
                                  )}
                                  title="Tìm kiếm CV"
                                >
                                  <Search size={18} strokeWidth={2.5} />
                                </button>
                              </div>

                              {/* Export Dropdown */}
                              <div className="relative">
                                <button
                                  onClick={() =>
                                    setIsExportMenuOpen(!isExportMenuOpen)
                                  }
                                  className="flex items-center justify-center p-2.5 bg-white text-green-600 border border-slate-200 rounded-xl hover:border-green-300 hover:bg-green-50 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-green-100"
                                  title="Tải EXCEL"
                                >
                                  <Download size={18} strokeWidth={2.5} />
                                </button>

                                <AnimatePresence>
                                  {isExportMenuOpen && (
                                    <>
                                      <div
                                        className="fixed inset-0 z-10"
                                        onClick={() =>
                                          setIsExportMenuOpen(false)
                                        }
                                      />
                                      <motion.div
                                        initial={{
                                          opacity: 0,
                                          y: 10,
                                          scale: 0.95,
                                        }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{
                                          opacity: 0,
                                          y: 10,
                                          scale: 0.95,
                                        }}
                                        className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 z-20 overflow-hidden"
                                      >
                                        <div className="p-2 space-y-1 text-left">
                                          <button
                                            onClick={() =>
                                              exportCVsToExcel("all")
                                            }
                                            className="w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors uppercase tracking-wide"
                                          >
                                            Tất cả
                                          </button>
                                          <button
                                            onClick={() =>
                                              exportCVsToExcel("completed")
                                            }
                                            className="w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold text-green-700 hover:bg-green-50 transition-colors uppercase tracking-wide"
                                          >
                                            Đã hoàn thành
                                          </button>
                                          <button
                                            onClick={() =>
                                              exportCVsToExcel("rejected")
                                            }
                                            className="w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold text-red-700 hover:bg-red-50 transition-colors uppercase tracking-wide"
                                          >
                                            Từ chối
                                          </button>
                                        </div>
                                      </motion.div>
                                    </>
                                  )}
                                </AnimatePresence>
                              </div>

                              {/* View Mode Dropdown */}
                              <div className="relative">
                                <button
                                  onClick={() =>
                                    setIsViewModeMenuOpen(!isViewModeMenuOpen)
                                  }
                                  className="flex items-center justify-center p-2.5 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 group"
                                  title="Chế độ xem"
                                >
                                  <SlidersHorizontal
                                    size={18}
                                    strokeWidth={2.5}
                                    className="text-slate-600 group-hover:text-blue-600 transition-colors"
                                  />
                                </button>

                                <AnimatePresence>
                                  {isViewModeMenuOpen && (
                                    <>
                                      <div
                                        className="fixed inset-0 z-10"
                                        onClick={() =>
                                          setIsViewModeMenuOpen(false)
                                        }
                                      />
                                      <motion.div
                                        initial={{
                                          opacity: 0,
                                          y: 10,
                                          scale: 0.95,
                                        }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{
                                          opacity: 0,
                                          y: 10,
                                          scale: 0.95,
                                        }}
                                        className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 z-20 overflow-hidden"
                                      >
                                        <div className="p-2 space-y-1">
                                          <button
                                            onClick={() => {
                                              setCvListViewMode("by_date");
                                              setIsViewModeMenuOpen(false);
                                            }}
                                            className={cn(
                                              "flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left text-xs font-bold uppercase tracking-wide transition-colors",
                                              cvListViewMode === "by_date"
                                                ? "bg-blue-50 text-blue-700"
                                                : "text-slate-600 hover:bg-slate-50",
                                            )}
                                          >
                                            {cvListViewMode === "by_date" && (
                                              <Check
                                                size={16}
                                                strokeWidth={3}
                                                className="text-blue-600"
                                              />
                                            )}
                                            <span
                                              className={cn(
                                                cvListViewMode === "by_date"
                                                  ? "ml-0"
                                                  : "ml-7",
                                              )}
                                            >
                                              Theo ngày
                                            </span>
                                          </button>
                                          <button
                                            onClick={() => {
                                              setCvListViewMode("prioritized");
                                              setIsViewModeMenuOpen(false);
                                            }}
                                            className={cn(
                                              "flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left text-xs font-bold uppercase tracking-wide transition-colors",
                                              cvListViewMode === "prioritized"
                                                ? "bg-blue-50 text-blue-700"
                                                : "text-slate-600 hover:bg-slate-50",
                                            )}
                                          >
                                            {cvListViewMode ===
                                              "prioritized" && (
                                              <Check
                                                size={16}
                                                strokeWidth={3}
                                                className="text-blue-600"
                                              />
                                            )}
                                            <span
                                              className={cn(
                                                cvListViewMode === "prioritized"
                                                  ? "ml-0"
                                                  : "ml-7",
                                              )}
                                            >
                                              Ưu tiên chờ xử lý
                                            </span>
                                          </button>
                                        </div>
                                      </motion.div>
                                    </>
                                  )}
                                </AnimatePresence>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-4">
                            {(() => {
                              const renderCVList = (
                                cvList: CV[],
                                isWaitlistWithActiveCourse?: boolean,
                                isWaitlist?: boolean,
                              ) =>
                                cvList.map((cv) => (
                                  <div
                                    key={cv.id}
                                    className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col lg:flex-row lg:items-start justify-between gap-6 hover:shadow-md transition-shadow relative overflow-hidden group"
                                  >
                                    {/* Status strip */}
                                    <div
                                      className={cn(
                                        "absolute top-0 left-0 w-1.5 h-full transition-all group-hover:w-2",
                                        cvFilterMapping.completed(cv)
                                          ? "bg-green-500"
                                          : cvFilterMapping.rejected(cv)
                                            ? "bg-red-500"
                                            : cvFilterMapping.processing(cv)
                                              ? "bg-blue-500 animate-pulse"
                                              : "bg-orange-400 animate-pulse",
                                      )}
                                    />

                                    <div className="flex items-start gap-4 flex-1 w-full pl-2">
                                      {adminCvTab === "delete" && (
                                        <input
                                          type="checkbox"
                                          className="w-5 h-5 mt-1 rounded border-red-300 text-red-600 focus:ring-red-500 flex-shrink-0"
                                          checked={selectedDeleteCvIds.includes(
                                            cv.id,
                                          )}
                                          onChange={(e) => {
                                            if (e.target.checked)
                                              setSelectedDeleteCvIds((prev) => [
                                                ...prev,
                                                cv.id,
                                              ]);
                                            else
                                              setSelectedDeleteCvIds((prev) =>
                                                prev.filter(
                                                  (id) => id !== cv.id,
                                                ),
                                              );
                                          }}
                                        />
                                      )}
                                      {adminCvTab === "app_approver" &&
                                        statusSubFilter === "processing" && (
                                          <input
                                            type="checkbox"
                                            className="w-5 h-5 mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                                            checked={selectedAppCvIds.includes(
                                              cv.id,
                                            )}
                                            onChange={(e) => {
                                              if (e.target.checked)
                                                setSelectedAppCvIds((prev) => [
                                                  ...prev,
                                                  cv.id,
                                                ]);
                                              else
                                                setSelectedAppCvIds((prev) =>
                                                  prev.filter(
                                                    (id) => id !== cv.id,
                                                  ),
                                                );
                                            }}
                                          />
                                        )}
                                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 pl-2 text-left items-start w-full">
                                        <div>
                                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                            Học viên
                                          </p>
                                          <h4 className="font-bold text-slate-900 text-sm">
                                            {cv.fullName} ({cv.age}t)
                                          </h4>
                                          <p className="text-sm font-medium text-slate-600 select-all">
                                            {cv.phone}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                            Hướng dẫn viên
                                          </p>
                                          <p className="text-xs font-bold text-blue-600 truncate">
                                            {cv.guideName}
                                          </p>
                                          <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[9px] font-medium text-slate-400 italic">
                                              SĐT: ...{cv.guidePhoneLast4}
                                            </span>
                                            <span className="w-1 h-1 rounded-full bg-slate-200" />
                                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">
                                              PIN: {cv.password}
                                            </span>
                                          </div>
                                        </div>
                                        <div>
                                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                            BILL CHUYỂN KHOẢN
                                          </p>
                                          {cv.paymentImageUrl ? (
                                            <button
                                              onClick={() =>
                                                setSelectedPaymentImage(
                                                  cv.paymentImageUrl || null,
                                                )
                                              }
                                              className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors border border-blue-100 flex items-center gap-2 shadow-sm w-fit"
                                            >
                                              <ImageIcon size={14} />
                                              <span className="text-[9px] font-black uppercase tracking-wider">
                                                Xem ảnh
                                              </span>
                                            </button>
                                          ) : (
                                            <p className="text-[10px] font-medium text-slate-400 italic">
                                              Không có ảnh
                                            </p>
                                          )}
                                        </div>

                                        <div>
                                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                            Người duyệt
                                          </p>
                                          {cv.status === "pending" ? (
                                            <select
                                              className="text-[10px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-400 transition-colors cursor-pointer uppercase tracking-wide"
                                              value={
                                                localReviewers[cv.id] || ""
                                              }
                                              onChange={(e) =>
                                                setLocalReviewers((prev) => ({
                                                  ...prev,
                                                  [cv.id]: e.target.value,
                                                }))
                                              }
                                            >
                                              <option value="" disabled>
                                                CHỌN NGƯỜI DUYỆT
                                              </option>
                                              {REVIEWERS.map((r) => (
                                                <option key={r} value={r}>
                                                  {r}
                                                </option>
                                              ))}
                                            </select>
                                          ) : (
                                            <p className="text-[10px] font-bold text-slate-600 uppercase mt-1">
                                              {cv.processedBy || "Chưa rõ"}
                                            </p>
                                          )}
                                        </div>

                                        <div className="flex flex-col gap-2">
                                          <div className="hidden sm:block">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                              Trạng thái
                                            </p>
                                            <div className="flex items-center gap-2">
                                              <p
                                                className={cn(
                                                  "text-[10px] font-black uppercase tracking-wider flex items-center gap-1",
                                                  cvFilterMapping.completed(cv)
                                                    ? "text-green-600"
                                                    : cvFilterMapping.rejected(
                                                          cv,
                                                        )
                                                      ? "text-red-600"
                                                      : cvFilterMapping.processing(
                                                            cv,
                                                          )
                                                        ? "text-blue-600"
                                                        : "text-orange-600",
                                                )}
                                              >
                                                {cvFilterMapping.completed(
                                                  cv,
                                                ) ? (
                                                  <>
                                                    <Check
                                                      size={12}
                                                      strokeWidth={3}
                                                    />{" "}
                                                    Hoàn thành
                                                  </>
                                                ) : cvFilterMapping.rejected(
                                                    cv,
                                                  ) ? (
                                                  <>
                                                    <X
                                                      size={12}
                                                      strokeWidth={3}
                                                    />{" "}
                                                    Từ chối
                                                  </>
                                                ) : cvFilterMapping.processing(
                                                    cv,
                                                  ) ? (
                                                  "● Đang duyệt"
                                                ) : (
                                                  "○ Chờ duyệt"
                                                )}
                                              </p>
                                            </div>
                                          </div>

                                          <div className="flex flex-wrap items-center gap-2 mt-2">
                                            {/* View App Approval Status / App Approver Manual Override */}
                                            {(cv.status === "approved" ||
                                              cv.appApproved ||
                                              cv.appRejectedReason) && (
                                              <div
                                                className={cn(
                                                  "p-2 rounded-xl transition-all border shadow-sm flex items-center justify-center cursor-default",
                                                  cv.appApproved
                                                    ? "bg-blue-50 text-blue-600 border-blue-100"
                                                    : cv.appRejectedReason
                                                      ? "bg-red-50 text-red-600 border-red-100"
                                                      : "bg-slate-50 text-slate-500 border-slate-100",
                                                )}
                                                title={
                                                  cv.appApproved
                                                    ? "Đã Duyệt App"
                                                    : cv.appRejectedReason
                                                      ? "Đã từ chối Duyệt App"
                                                      : "Chưa Duyệt App"
                                                }
                                              >
                                                <Smartphone
                                                  size={16}
                                                  strokeWidth={3}
                                                />
                                              </div>
                                            )}

                                            {(unlockedRoles.accountant ||
                                              unlockedRoles.app_approver ||
                                              unlockedRoles.delete) && (
                                              <button
                                                onClick={() => startEditCV(cv)}
                                                className="p-2 bg-slate-50 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-slate-100 hover:border-blue-100 shadow-sm"
                                                title="Sửa thông tin"
                                              >
                                                <Edit3
                                                  size={16}
                                                  strokeWidth={3}
                                                />
                                              </button>
                                            )}

                                            {isWaitlist && (
                                              <button
                                                onClick={async () => {
                                                  if (
                                                    await customConfirm(
                                                      "Bạn có chắc chắn muốn xóa học viên này khỏi danh sách Học lại chờ phân bổ?",
                                                    )
                                                  ) {
                                                    await deleteDoc(
                                                      doc(db, "cvs", cv.id),
                                                    );
                                                  }
                                                }}
                                                className="p-2 bg-red-50 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-xl transition-all border border-red-100 shadow-sm"
                                                title="Xóa khỏi danh sách"
                                              >
                                                <Trash2
                                                  size={16}
                                                  strokeWidth={3}
                                                />
                                              </button>
                                            )}

                                            {adminCvTab === "accountant" &&
                                              cvFilterMapping.pending(cv) && (
                                                <>
                                                  <button
                                                    onClick={() =>
                                                      handleCVAction(
                                                        cv.id,
                                                        "approve",
                                                      )
                                                    }
                                                    className="p-2 bg-green-50 text-green-600 hover:bg-green-100 rounded-xl transition-all border border-green-100 shadow-sm"
                                                    title="Phê duyệt"
                                                  >
                                                    <Check
                                                      size={16}
                                                      strokeWidth={3}
                                                    />
                                                  </button>
                                                  <button
                                                    onClick={() =>
                                                      handleCVAction(
                                                        cv.id,
                                                        "reject",
                                                      )
                                                    }
                                                    className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition-all border border-red-100 shadow-sm"
                                                    title="Từ chối"
                                                  >
                                                    <X
                                                      size={16}
                                                      strokeWidth={3}
                                                    />
                                                  </button>
                                                </>
                                              )}

                                            {adminCvTab === "app_approver" &&
                                              cvFilterMapping.processing(
                                                cv,
                                              ) && (
                                                <>
                                                  <button
                                                    onClick={() => {
                                                      setSelectedAppCvIds([
                                                        cv.id,
                                                      ]);
                                                      setCvActionModal({
                                                        show: true,
                                                        cvId: "",
                                                        type: "bulkApproveApp",
                                                      });
                                                    }}
                                                    className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl transition-all border border-blue-100 shadow-sm"
                                                    title="Duyệt App"
                                                  >
                                                    <Check
                                                      size={16}
                                                      strokeWidth={3}
                                                    />
                                                  </button>
                                                  <button
                                                    onClick={() => {
                                                      setSelectedAppCvIds([
                                                        cv.id,
                                                      ]);
                                                      setCvActionModal({
                                                        show: true,
                                                        cvId: "",
                                                        type: "bulkRejectApp",
                                                      });
                                                    }}
                                                    className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition-all border border-red-100 shadow-sm"
                                                    title="Từ chối App"
                                                  >
                                                    <X
                                                      size={16}
                                                      strokeWidth={3}
                                                    />
                                                  </button>
                                                </>
                                              )}

                                            {adminCvTab === "app_approver" &&
                                              cvFilterMapping.completed(cv) && (
                                                <button
                                                  onClick={() => {
                                                    setSelectedAppCvIds([
                                                      cv.id,
                                                    ]);
                                                    setCvActionModal({
                                                      show: true,
                                                      cvId: "",
                                                      type: "bulkRejectApp",
                                                    });
                                                  }}
                                                  className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition-all border border-red-100 shadow-sm"
                                                  title="Hủy Duyệt App"
                                                >
                                                  <X
                                                    size={16}
                                                    strokeWidth={3}
                                                  />
                                                </button>
                                              )}

                                            {cvFilterMapping.rejected(cv) && (
                                              <button
                                                onClick={() =>
                                                  handleCVAction(
                                                    cv.id,
                                                    "restore",
                                                  )
                                                }
                                                className="p-2 bg-slate-50 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-slate-100 hover:border-blue-100 shadow-sm"
                                                title="Khôi phục"
                                              >
                                                <RotateCcw
                                                  size={16}
                                                  strokeWidth={3}
                                                />
                                              </button>
                                            )}

                                            {isWaitlistWithActiveCourse && (
                                              <button
                                                onClick={async (e) => {
                                                  e.stopPropagation();
                                                  if (
                                                    !(await customConfirm(
                                                      "Điều chuyển chuyển HV này về Danh sách chờ (HV sẽ bị xóa khỏi khóa học hiện tại)?",
                                                    ))
                                                  )
                                                    return;

                                                  const activeCourse =
                                                    courses.find((course) =>
                                                      course.studentIds.some(
                                                        (id) => {
                                                          const compCv =
                                                            cvs.find(
                                                              (x) =>
                                                                x.id === id,
                                                            );
                                                          return (
                                                            compCv &&
                                                            (compCv.phone ===
                                                              cv.phone ||
                                                              compCv.phoneLast4 ===
                                                                cv.phoneLast4)
                                                          );
                                                        },
                                                      ),
                                                    );

                                                  if (activeCourse) {
                                                    const activeCvId =
                                                      activeCourse.studentIds.find(
                                                        (id) => {
                                                          const compCv =
                                                            cvs.find(
                                                              (x) =>
                                                                x.id === id,
                                                            );
                                                          return (
                                                            compCv &&
                                                            (compCv.phone ===
                                                              cv.phone ||
                                                              compCv.phoneLast4 ===
                                                                cv.phoneLast4)
                                                          );
                                                        },
                                                      );

                                                    if (activeCvId) {
                                                      const updatedTracking =
                                                        activeCourse.tracking
                                                          ? {
                                                              ...activeCourse.tracking,
                                                            }
                                                          : {};
                                                      delete updatedTracking[
                                                        activeCvId
                                                      ];

                                                      await updateDoc(
                                                        doc(
                                                          db,
                                                          "courses",
                                                          activeCourse.id,
                                                        ),
                                                        {
                                                          studentIds:
                                                            activeCourse.studentIds.filter(
                                                              (id) =>
                                                                id !==
                                                                activeCvId,
                                                            ),
                                                          tracking:
                                                            updatedTracking,
                                                        },
                                                      );

                                                      await updateDoc(
                                                        doc(
                                                          db,
                                                          "cvs",
                                                          activeCvId,
                                                        ),
                                                        {
                                                          companion:
                                                            deleteField(),
                                                          studyGroup:
                                                            deleteField(),
                                                          studentId:
                                                            deleteField(),
                                                        },
                                                      );
                                                      setChromeAlert(
                                                        "Đã điều chuyển về danh sách chờ và xóa khỏi khóa học cũ!",
                                                      );
                                                    }
                                                  }
                                                }}
                                                className="px-3 py-1.5 bg-yellow-50 text-amber-600 hover:bg-yellow-100 rounded-xl transition-all border border-yellow-200 shadow-sm font-bold text-[10px] uppercase tracking-widest flex items-center gap-1.5"
                                                title="Điều chuyển về danh sách chờ (loại khỏi khóa)"
                                              >
                                                <ArrowDownToLine
                                                  size={14}
                                                  strokeWidth={2.5}
                                                />
                                                ĐIỀU CHUYỂN NGAY
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ));

                              if (
                                adminCvTab === "learning" &&
                                !selectedCourseId
                              ) {
                                return (
                                  <>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                      {courses.map((course) => {
                                        const courseCvs = cvs.filter((c) =>
                                          course.studentIds.includes(c.id),
                                        );
                                        const newEnroll = courseCvs.filter(
                                          (c) => c.type !== "reenroll",
                                        ).length;
                                        const reEnroll = courseCvs.filter(
                                          (c) => c.type === "reenroll",
                                        ).length;

                                        return (
                                          <div
                                            key={course.id}
                                            className="bg-white p-6 rounded-[2.5rem] border border-purple-100 shadow-sm hover:shadow-xl transition-all relative group cursor-pointer overflow-hidden"
                                            onClick={() =>
                                              setSelectedCourseId(course.id)
                                            }
                                          >
                                            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50 rounded-bl-full -mr-8 -mt-8 opacity-0 group-hover:opacity-100 transition-all pointer-events-none" />

                                            <div className="flex items-start justify-between mb-4">
                                              <div className="w-12 h-12 bg-purple-50 flex items-center justify-center rounded-2xl text-purple-600 shadow-inner group-hover:bg-purple-600 group-hover:text-white transition-colors duration-300">
                                                <GraduationCap size={24} />
                                              </div>
                                              <div className="flex flex-col items-end gap-1.5">
                                                {newEnroll > 0 && (
                                                  <div className="relative flex items-center">
                                                    <span className="px-2 py-0.5 bg-emerald-500 text-white text-[8px] font-black rounded-full uppercase tracking-tighter shadow-sm">
                                                      +{newEnroll} Mới
                                                    </span>
                                                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                                    </span>
                                                  </div>
                                                )}
                                              </div>
                                            </div>

                                            <h4 className="font-black text-slate-800 text-lg mb-2 group-hover:text-purple-700 transition-colors">
                                              {course.name}
                                            </h4>
                                            <div className="space-y-1 mb-4">
                                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                                <CalendarIcon
                                                  size={12}
                                                  className="text-purple-400"
                                                />
                                                {format(
                                                  new Date(course.startDate),
                                                  "dd/MM/yyyy",
                                                )}{" "}
                                                -{" "}
                                                {format(
                                                  new Date(course.endDate),
                                                  "dd/MM/yyyy",
                                                )}
                                              </p>
                                              <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest flex items-center gap-1.5">
                                                <Clock
                                                  size={12}
                                                  className="text-red-300"
                                                />
                                                Chốt:{" "}
                                                {format(
                                                  new Date(course.closingDate),
                                                  "dd/MM/yyyy",
                                                )}
                                              </p>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-slate-50">
                                              <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-black uppercase tracking-widest">
                                                {courseCvs.length} Học viên
                                              </span>
                                              {reEnroll > 0 && (
                                                <span className="px-2 py-1 bg-yellow-50 text-amber-600 rounded-lg text-[10px] font-bold border border-amber-100">
                                                  {reEnroll} Học lại
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                      {courses.length === 0 && (
                                        <div className="col-span-full py-12 text-center text-slate-500 font-medium">
                                          Chưa có khóa học nào.
                                        </div>
                                      )}
                                    </div>

                                    <div className="mt-12 space-y-12">
                                      {(() => {
                                        const allReenrollWaitlistCvs =
                                          cvs.filter(
                                            (c) =>
                                              c.type === "reenroll" &&
                                              !courses.some((course) =>
                                                course.studentIds.includes(
                                                  c.id,
                                                ),
                                              ),
                                          );

                                        const cvsInCurrentCourses = cvs.filter(
                                          (c) =>
                                            courses.some((course) =>
                                              course.studentIds.includes(c.id),
                                            ),
                                        );

                                        const waitlistInCourse =
                                          allReenrollWaitlistCvs.filter((wc) =>
                                            cvsInCurrentCourses.some(
                                              (cc) =>
                                                (cc.phone === wc.phone ||
                                                  cc.phoneLast4 ===
                                                    wc.phoneLast4) &&
                                                cc.id !== wc.id,
                                            ),
                                          );
                                        const waitlistNotInCourse =
                                          allReenrollWaitlistCvs.filter(
                                            (wc) =>
                                              !cvsInCurrentCourses.some(
                                                (cc) =>
                                                  (cc.phone === wc.phone ||
                                                    cc.phoneLast4 ===
                                                      wc.phoneLast4) &&
                                                  cc.id !== wc.id,
                                              ),
                                          );

                                        return (
                                          <>
                                            <div>
                                              <div className="flex items-center gap-3 mb-6">
                                                <h3 className="text-xl font-bold text-slate-800 uppercase tracking-tight flex items-center gap-3">
                                                  Danh sách Học lại chờ phân bổ
                                                  <span className="relative flex h-3 w-3">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 shadow-sm border border-white"></span>
                                                  </span>
                                                </h3>
                                                <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-xs font-black shadow-sm">
                                                  {waitlistNotInCourse.length}{" "}
                                                  CV MỚI
                                                </span>
                                              </div>
                                              <div className="grid grid-cols-1 gap-4">
                                                {renderCVList(
                                                  waitlistNotInCourse,
                                                  false,
                                                  true,
                                                )}
                                              </div>
                                            </div>

                                            {waitlistInCourse.length > 0 && (
                                              <div className="bg-yellow-50/50 p-6 rounded-[2rem] border border-yellow-100 shadow-inner">
                                                <div className="flex items-center gap-3 mb-4">
                                                  <h3 className="text-xl font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2">
                                                    Danh sách chờ phân bổ{" "}
                                                    <span className="text-amber-600">
                                                      (Đang có trong khóa)
                                                    </span>
                                                  </h3>
                                                  <span className="px-3 py-1 bg-white text-slate-700 rounded-lg text-xs font-black shadow-sm">
                                                    {waitlistInCourse.length}
                                                  </span>
                                                </div>
                                                <p className="text-xs font-bold text-slate-500 mb-6">
                                                  Học viên đã nộp CV xin học lại
                                                  nhưng vẫn đang được phân bổ
                                                  trong một khóa học khác.
                                                </p>
                                                <div className="grid grid-cols-1 gap-4">
                                                  {renderCVList(
                                                    waitlistInCourse,
                                                    true,
                                                    true,
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                          </>
                                        );
                                      })()}
                                    </div>
                                  </>
                                );
                              }

                              if (
                                adminCvTab === "learning" &&
                                selectedCourseId
                              ) {
                                const course = courses.find(
                                  (c) => c.id === selectedCourseId,
                                );
                                if (!course) return null;
                                const enrolledCvs = cvs.filter((c) =>
                                  course.studentIds.includes(c.id),
                                );
                                return (
                                  <div className="space-y-6">
                                    <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
                                      <div className="flex items-center gap-6">
                                        <button
                                          onClick={() => {
                                            setSelectedCourseId(null);
                                            setCourseSearchText("");
                                          }}
                                          className="p-3 bg-slate-50 text-slate-500 hover:text-slate-800 rounded-2xl transition-all hover:scale-110 active:scale-95 border border-slate-100"
                                        >
                                          <ArrowLeft size={24} />
                                        </button>
                                        <div>
                                          <div className="flex items-center gap-3 mb-1">
                                            <h3 className="font-black text-slate-900 text-2xl tracking-tighter uppercase">
                                              {course.name}
                                            </h3>
                                            <div className="flex gap-1.5 p-1 bg-slate-50 rounded-lg border border-slate-100">
                                              <button
                                                onClick={async (e) => {
                                                  e.stopPropagation();
                                                  const pwd =
                                                    await customPasswordPrompt(
                                                      "Vui lòng nhập mật khẩu Xóa để sửa khóa học:",
                                                    );
                                                  if (
                                                    pwd !==
                                                    dbRolePasswords.delete
                                                  ) {
                                                    if (pwd !== null)
                                                      setChromeAlert(
                                                        "Mật khẩu không chính xác!",
                                                      );
                                                    return;
                                                  }
                                                  setCourseForm({
                                                    name: course.name,
                                                    start: course.startDate,
                                                    end: course.endDate,
                                                    closingDate:
                                                      course.closingDate,
                                                    autoAddFromDate: course.autoAddFromDate || "",
                                                  });
                                                  setEditingCourseId(course.id);
                                                  setSelectedLearningCvIds(
                                                    course.studentIds,
                                                  );
                                                  setShowCreateCourseModal(
                                                    true,
                                                  );
                                                }}
                                                className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition-colors"
                                                title="Sửa khóa học"
                                              >
                                                <Edit3 size={16} />
                                              </button>
                                              <button
                                                onClick={async (e) => {
                                                  e.stopPropagation();
                                                  const pwd =
                                                    await customPasswordPrompt(
                                                      "Vui lòng nhập mật khẩu Xóa để xóa khóa học:",
                                                    );
                                                  if (
                                                    pwd !==
                                                    dbRolePasswords.delete
                                                  ) {
                                                    if (pwd !== null)
                                                      setChromeAlert(
                                                        "Mật khẩu không chính xác!",
                                                      );
                                                    return;
                                                  }
                                                  if (
                                                    await customConfirm(
                                                      "Bạn có chắc muốn xóa khóa học này?",
                                                    )
                                                  ) {
                                                    await deleteDoc(
                                                      doc(
                                                        db,
                                                        "courses",
                                                        course.id,
                                                      ),
                                                    );
                                                    setSelectedCourseId(null);
                                                  }
                                                }}
                                                className="p-1.5 text-red-600 hover:bg-red-100 rounded-md transition-colors"
                                                title="Xóa khóa học"
                                              >
                                                <Trash2 size={16} />
                                              </button>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-2 px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-purple-100">
                                              Tổng: {enrolledCvs.length} Học
                                              viên
                                            </div>
                                            <div className="flex flex-wrap items-center gap-3">
                                              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1">
                                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                                {
                                                  enrolledCvs.filter(
                                                    (c) =>
                                                      c.type !== "reenroll" &&
                                                      !(c.studyGroup || "")
                                                        .toLowerCase()
                                                        .includes("ngừng"),
                                                  ).length
                                                }{" "}
                                                Mới
                                              </span>
                                              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1">
                                                <div className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                                                {
                                                  enrolledCvs.filter(
                                                    (c) =>
                                                      c.type === "reenroll" &&
                                                      !(c.studyGroup || "")
                                                        .toLowerCase()
                                                        .includes("ngừng"),
                                                  ).length
                                                }{" "}
                                                Học lại
                                              </span>
                                              {enrolledCvs.filter((c) =>
                                                (c.studyGroup || "")
                                                  .toLowerCase()
                                                  .includes("ngừng"),
                                              ).length > 0 && (
                                                <span className="text-[10px] font-bold text-rose-600 uppercase tracking-widest flex items-center gap-1">
                                                  <div className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
                                                  {
                                                    enrolledCvs.filter((c) =>
                                                      (c.studyGroup || "")
                                                        .toLowerCase()
                                                        .includes("ngừng"),
                                                    ).length
                                                  }{" "}
                                                  Ngừng/Học lại
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <button
                                          onClick={async () => {
                                            if (
                                              !(await customConfirm(
                                                "Tạo mã học viên định dạng HV-01 tự động xếp theo Group Học Tập -> Người Đồng Hành -> Mentor?",
                                              ))
                                            )
                                              return;

                                            // Sort by Group -> Companion -> Guide (Mentor) -> Name
                                            const sorted = [
                                              ...enrolledCvs,
                                            ].sort((a, b) => {
                                              const sgA = a.studyGroup || "ZZZ";
                                              const sgB = b.studyGroup || "ZZZ";
                                              if (sgA !== sgB)
                                                return sgA.localeCompare(sgB);

                                              const cA = a.companion || "ZZZ";
                                              const cB = b.companion || "ZZZ";
                                              if (cA !== cB)
                                                return cA.localeCompare(cB);

                                              const gA = a.guideName || "ZZZ";
                                              const gB = b.guideName || "ZZZ";
                                              if (gA !== gB)
                                                return gA.localeCompare(gB);

                                              return a.fullName.localeCompare(
                                                b.fullName,
                                              );
                                            });

                                            try {
                                              await Promise.all(
                                                sorted.map((cv, index) => {
                                                  const idNum = (index + 1)
                                                    .toString()
                                                    .padStart(2, "0");
                                                  const studentId = `HV-${idNum}`;
                                                  return updateDoc(
                                                    doc(db, "cvs", cv.id),
                                                    { studentId },
                                                  );
                                                }),
                                              );
                                              setChromeAlert(
                                                "Đã tạo mã học viên thành công!",
                                              );
                                            } catch (e) {
                                              console.error(e);
                                            }
                                          }}
                                          className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-2xl hover:bg-purple-700 transition-all text-xs font-black uppercase tracking-widest shadow-lg shadow-purple-200 active:scale-95"
                                        >
                                          <Sparkles size={18} />
                                          Đánh Mã HV
                                        </button>
                                        <button
                                          onClick={async () => {
                                            const XLSX =
                                              await import("xlsx-js-style");

                                            // Sort data same as view
                                            const sorted = [
                                              ...enrolledCvs,
                                            ].sort((a, b) => {
                                              const sgA = a.studyGroup || "ZZZ";
                                              const sgB = b.studyGroup || "ZZZ";
                                              if (sgA !== sgB)
                                                return sgA.localeCompare(sgB);

                                              const cA = a.companion || "ZZZ";
                                              const cB = b.companion || "ZZZ";
                                              if (cA !== cB)
                                                return cA.localeCompare(cB);

                                              const gA = a.guideName || "ZZZ";
                                              const gB = b.guideName || "ZZZ";
                                              if (gA !== gB)
                                                return gA.localeCompare(gB);

                                              return a.fullName.localeCompare(
                                                b.fullName,
                                              );
                                            });

                                            const aoa = [];
                                            // Row 0
                                            aoa.push([
                                              `DANH SÁCH ĐĂNG KÝ HỌC ${course.name}`,
                                            ]);

                                            // Row 1
                                            aoa.push([
                                              "STT",
                                              "NGƯỜI ĐỒNG HÀNH",
                                              "MÃ HỌC VIÊN",
                                              "HỌ TÊN",
                                              "TUỔI",
                                              "HDV",
                                              "GROUP HỌC TẬP",
                                              "FACEBOOK",
                                              "BUỔI ĐỊNH HÌNH",
                                              "",
                                              "BUỔI 1",
                                              "",
                                              "BUỔI 2",
                                              "",
                                              "BUỔI 3",
                                              "",
                                              "BUỔI 4",
                                              "",
                                              "BUỔI 5",
                                              "",
                                              "BUỔI 6",
                                              "",
                                            ]);

                                            // Row 2
                                            aoa.push([
                                              "",
                                              "",
                                              "",
                                              "",
                                              "",
                                              "",
                                              "",
                                              "",
                                              "HỌC",
                                              "HÀNH",
                                              "HỌC",
                                              "HÀNH",
                                              "HỌC",
                                              "HÀNH",
                                              "HỌC",
                                              "HÀNH",
                                              "HỌC",
                                              "HÀNH",
                                              "HỌC",
                                              "HÀNH",
                                              "HỌC",
                                              "HÀNH",
                                            ]);

                                            // Data Rows
                                            sorted
                                              .filter((c) => c.type !== "reenroll")
                                              .forEach((cv, idx) => {
                                              const track =
                                                course.tracking?.[cv.id] || {};
                                              const rowData = [
                                                idx + 1,
                                                cv.companion || "",
                                                cv.studentId || "",
                                                cv.fullName || "",
                                                cv.age || "",
                                                cv.guideName || "",
                                                cv.studyGroup || "",
                                                cv.facebookLink
                                                  ? cv.facebookLink.includes(
                                                      "http",
                                                    )
                                                    ? cv.facebookLink
                                                    : `https://${cv.facebookLink}`
                                                  : "",
                                              ];

                                              [
                                                "buoiDinhHinh",
                                                "buoi1",
                                                "buoi2",
                                                "buoi3",
                                                "buoi4",
                                                "buoi5",
                                                "buoi6",
                                              ].forEach((b) => {
                                                rowData.push(
                                                  track[b]?.hoc ? "✅" : "❌",
                                                );
                                                rowData.push(
                                                  track[b]?.hanh || "🖤",
                                                );
                                              });

                                              aoa.push(rowData);
                                            });

                                            const ws =
                                              XLSX.utils.aoa_to_sheet(aoa);

                                            // Styling & Merges
                                            ws["!merges"] = [
                                              // Row 0 merge over 22 cols
                                              {
                                                s: { r: 0, c: 0 },
                                                e: { r: 0, c: 21 },
                                              },
                                              // Row 1 merges down to row 2 for first 8 cols
                                              {
                                                s: { r: 1, c: 0 },
                                                e: { r: 2, c: 0 },
                                              },
                                              {
                                                s: { r: 1, c: 1 },
                                                e: { r: 2, c: 1 },
                                              },
                                              {
                                                s: { r: 1, c: 2 },
                                                e: { r: 2, c: 2 },
                                              },
                                              {
                                                s: { r: 1, c: 3 },
                                                e: { r: 2, c: 3 },
                                              },
                                              {
                                                s: { r: 1, c: 4 },
                                                e: { r: 2, c: 4 },
                                              },
                                              {
                                                s: { r: 1, c: 5 },
                                                e: { r: 2, c: 5 },
                                              },
                                              {
                                                s: { r: 1, c: 6 },
                                                e: { r: 2, c: 6 },
                                              },
                                              {
                                                s: { r: 1, c: 7 },
                                                e: { r: 2, c: 7 },
                                              },
                                              // Row 1 merges across 2 cols for buoi
                                              {
                                                s: { r: 1, c: 8 },
                                                e: { r: 1, c: 9 },
                                              },
                                              {
                                                s: { r: 1, c: 10 },
                                                e: { r: 1, c: 11 },
                                              },
                                              {
                                                s: { r: 1, c: 12 },
                                                e: { r: 1, c: 13 },
                                              },
                                              {
                                                s: { r: 1, c: 14 },
                                                e: { r: 1, c: 15 },
                                              },
                                              {
                                                s: { r: 1, c: 16 },
                                                e: { r: 1, c: 17 },
                                              },
                                              {
                                                s: { r: 1, c: 18 },
                                                e: { r: 1, c: 19 },
                                              },
                                              {
                                                s: { r: 1, c: 20 },
                                                e: { r: 1, c: 21 },
                                              },
                                            ];

                                            const CCE5CC = "CCE5CC";
                                            const B3D4FF = "B3D4FF";
                                            const E5CCFF = "E5CCFF";
                                            const FFE699 = "FFE699";

                                            // Apply Styles
                                            for (
                                              let R = 0;
                                              R <= aoa.length - 1;
                                              ++R
                                            ) {
                                              for (let C = 0; C <= 21; ++C) {
                                                const cellAddress =
                                                  XLSX.utils.encode_cell({
                                                    r: R,
                                                    c: C,
                                                  });
                                                if (!ws[cellAddress])
                                                  ws[cellAddress] = {
                                                    t: "s",
                                                    v: "",
                                                  }; // fill empty

                                                let bgColor = "FFFFFF";
                                                let bold = false;

                                                if (R === 0) {
                                                  bgColor = "FFFF00";
                                                  bold = true;
                                                } else if (R === 1 || R === 2) {
                                                  bold = true;
                                                  if (C <= 2) bgColor = CCE5CC;
                                                  else if (C <= 4)
                                                    bgColor = B3D4FF;
                                                  else if (C <= 7)
                                                    bgColor = E5CCFF;
                                                  else bgColor = FFE699;
                                                } else {
                                                  bold = false;
                                                  if (C <= 2)
                                                    bgColor = "E8F5E9";
                                                  else if (C <= 4)
                                                    bgColor = "E3F2FD";
                                                  else if (C <= 7)
                                                    bgColor = "F3E5F5";
                                                  else bgColor = "FFF8E1";
                                                }

                                                ws[cellAddress].s = {
                                                  font: {
                                                    name: "Google Sans",
                                                    sz: 10,
                                                    bold: bold,
                                                  },
                                                  alignment: {
                                                    vertical: "center",
                                                    horizontal: "center",
                                                    wrapText: true,
                                                  },
                                                  fill: {
                                                    fgColor: { rgb: bgColor },
                                                  },
                                                  border: {
                                                    top: {
                                                      style: "thin",
                                                      color: { auto: 1 },
                                                    },
                                                    bottom: {
                                                      style: "thin",
                                                      color: { auto: 1 },
                                                    },
                                                    left: {
                                                      style: "thin",
                                                      color: { auto: 1 },
                                                    },
                                                    right: {
                                                      style: "thin",
                                                      color: { auto: 1 },
                                                    },
                                                  },
                                                };
                                              }
                                            }

                                            // Adjust Column Widths
                                            ws["!cols"] = [
                                              { wch: 5 }, // STT
                                              { wch: 18 }, // NGUOI DONG HANH
                                              { wch: 12 }, // MA HOC VIEN
                                              { wch: 20 }, // HO TEN
                                              { wch: 6 }, // TUOI
                                              { wch: 15 }, // HDV
                                              { wch: 18 }, // GROUP HOC TAP
                                              { wch: 12 }, // FACEBOOK
                                              { wch: 6 },
                                              { wch: 10 }, // BDH
                                              { wch: 6 },
                                              { wch: 10 }, // B1
                                              { wch: 6 },
                                              { wch: 10 }, // B2
                                              { wch: 6 },
                                              { wch: 10 }, // B3
                                              { wch: 6 },
                                              { wch: 10 }, // B4
                                              { wch: 6 },
                                              { wch: 10 }, // B5
                                              { wch: 6 },
                                              { wch: 10 }, // B6
                                            ];

                                            const wb = XLSX.utils.book_new();
                                            ws["!autofilter"] = {
                                              ref: `A2:V${aoa.length}`,
                                            };
                                            XLSX.utils.book_append_sheet(
                                              wb,
                                              ws,
                                              "Khóa Học",
                                            );
                                            XLSX.writeFile(
                                              wb,
                                              `KhoaHoc_${course.name}_${format(new Date(), "yyyyMMdd_HHmmss")}.xlsx`,
                                            );
                                          }}
                                          className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-200 active:scale-95"
                                        >
                                          <Download size={18} />
                                          Xuất Excel
                                        </button>
                                      </div>
                                    </div>

                                    <div className="flex flex-col lg:flex-row gap-8 items-start">
                                      {/* Left Tabs pane */}
                                      <div className="w-full lg:w-64 shrink-0 flex flex-col gap-2 relative lg:sticky lg:top-[4.5rem] z-20">
                                        <div className="mb-4">
                                          <div className="relative">
                                            <Search
                                              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                                              size={16}
                                            />
                                            <input
                                              type="text"
                                              placeholder="Tìm tên, SĐT, Mã HV..."
                                              value={courseSearchText}
                                              onChange={(e) =>
                                                setCourseSearchText(
                                                  e.target.value,
                                                )
                                              }
                                              className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none transition-all shadow-sm"
                                            />
                                          </div>
                                        </div>
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mb-1">
                                          Công tác phân bổ
                                        </div>
                                        <button
                                          onClick={() => {
                                            setCourseDetailTab("companion");
                                            setSelectedStudentIdsForAssign([]);
                                            setBulkAssignInput("");
                                            setAssignFilter("all");
                                          }}
                                          className={cn(
                                            "px-4 py-3.5 rounded-2xl text-left font-black text-xs uppercase tracking-tight transition-all border",
                                            courseDetailTab === "companion"
                                              ? "bg-purple-600 text-white shadow-xl shadow-purple-200 border-purple-600"
                                              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
                                          )}
                                        >
                                          Phân bổ Người đồng hành
                                        </button>
                                        <button
                                          onClick={() => {
                                            setCourseDetailTab("group");
                                            setSelectedStudentIdsForAssign([]);
                                            setBulkAssignInput("");
                                            setAssignFilter("all");
                                          }}
                                          className={cn(
                                            "px-4 py-3.5 rounded-2xl text-left font-black text-xs uppercase tracking-tight transition-all border",
                                            courseDetailTab === "group"
                                              ? "bg-purple-600 text-white shadow-xl shadow-purple-200 border-purple-600"
                                              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
                                          )}
                                        >
                                          Phân bổ Group học tập
                                        </button>

                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mt-4 mb-1">
                                          Bảng theo dõi học tập
                                        </div>
                                        <button
                                          onClick={() => {
                                            setCourseDetailTab("tracking");
                                            setSelectedStudentIdsForAssign([]);
                                            setBulkAssignInput("");
                                            setAssignFilter("all");
                                          }}
                                          className={cn(
                                            "px-4 py-3.5 rounded-2xl text-left font-black text-xs uppercase tracking-tight transition-all border",
                                            courseDetailTab === "tracking"
                                              ? "bg-yellow-400 text-amber-950 shadow-xl shadow-yellow-200 border-yellow-400"
                                              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
                                          )}
                                        >
                                          Bảng theo dõi học tập (
                                          {course.tracking
                                            ? Object.keys(course.tracking)
                                                .length
                                            : 0}
                                          )
                                        </button>
                                        <button
                                          onClick={() => {
                                            setCourseDetailTab("analytics");
                                            setSelectedStudentIdsForAssign([]);
                                            setBulkAssignInput("");
                                            setAssignFilter("all");
                                          }}
                                          className={cn(
                                            "px-4 py-3.5 rounded-2xl text-left font-black text-xs uppercase tracking-tight transition-all border",
                                            courseDetailTab === "analytics"
                                              ? "bg-blue-600 text-white shadow-xl shadow-blue-200 border-blue-600"
                                              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
                                          )}
                                        >
                                          Phân tích chỉ số học tập
                                        </button>
                                      </div>

                                      {/* Right Content pane */}
                                      <div className="flex-1 bg-white border border-slate-200 rounded-[2.5rem] p-8 flex flex-col gap-8 min-w-0 shadow-sm w-full">
                                        {(() => {
                                          const searchedText =
                                            courseSearchText.toLowerCase();
                                          const searchedCvs =
                                            enrolledCvs.filter((cv) => {
                                              if (!searchedText) return true;
                                              return (
                                                (cv.fullName || "")
                                                  .toLowerCase()
                                                  .includes(searchedText) ||
                                                (cv.phoneNumber || "")
                                                  .toLowerCase()
                                                  .includes(searchedText) ||
                                                (cv.studentId || "")
                                                  .toLowerCase()
                                                  .includes(searchedText)
                                              );
                                            });

                                          if (courseDetailTab === "analytics") {
                                            const sortedForAnalytics =
                                              searchedCvs.map((cv) => {
                                                const track =
                                                  course.tracking?.[cv.id] ||
                                                  {};
                                                let completedLessons = 0;
                                                [
                                                  "buoiDinhHinh",
                                                  "buoi1",
                                                  "buoi2",
                                                  "buoi3",
                                                  "buoi4",
                                                  "buoi5",
                                                  "buoi6",
                                                ].forEach((b) => {
                                                  if (track[b]?.hoc)
                                                    completedLessons++;
                                                });
                                                let stars = 0;
                                                [
                                                  "buoiDinhHinh",
                                                  "buoi1",
                                                  "buoi2",
                                                  "buoi3",
                                                  "buoi4",
                                                  "buoi5",
                                                  "buoi6",
                                                ].forEach((b) => {
                                                  const hanh = track[b]?.hanh;
                                                  if (hanh === "⭐") stars += 1;
                                                  else if (hanh === "⭐⭐")
                                                    stars += 2;
                                                  else if (hanh === "❤️❤️❤️")
                                                    stars += 3;
                                                });
                                                return {
                                                  ...cv,
                                                  completedLessons,
                                                  stars,
                                                };
                                              });

                                            const groupStats = Array.from(
                                              new Set(
                                                sortedForAnalytics.map(
                                                  (c) =>
                                                    c.studyGroup || "Chưa nhóm",
                                                ),
                                              ),
                                            )
                                              .map((group) => {
                                                const studentsInGroup =
                                                  sortedForAnalytics.filter(
                                                    (c) =>
                                                      (c.studyGroup ||
                                                        "Chưa nhóm") === group,
                                                  );
                                                const totalLessons =
                                                  studentsInGroup.reduce(
                                                    (sum, c) =>
                                                      sum + c.completedLessons,
                                                    0,
                                                  );
                                                const totalStars =
                                                  studentsInGroup.reduce(
                                                    (sum, c) => sum + c.stars,
                                                    0,
                                                  );
                                                const maxPossibleLessons =
                                                  studentsInGroup.length * 7;
                                                return {
                                                  name: group,
                                                  hocRate: maxPossibleLessons
                                                    ? Number(
                                                        (
                                                          (totalLessons /
                                                            maxPossibleLessons) *
                                                          100
                                                        ).toFixed(1),
                                                      )
                                                    : 0,
                                                  stars: totalStars,
                                                  studentCount:
                                                    studentsInGroup.length,
                                                };
                                              })
                                              .sort(
                                                (a, b) => b.hocRate - a.hocRate,
                                              );

                                            const companionStats = Array.from(
                                              new Set(
                                                sortedForAnalytics.map(
                                                  (c) =>
                                                    c.companion || "Chưa có",
                                                ),
                                              ),
                                            )
                                              .map((comp) => {
                                                const students =
                                                  sortedForAnalytics.filter(
                                                    (c) =>
                                                      (c.companion ||
                                                        "Chưa có") === comp,
                                                  );
                                                const totalLessons =
                                                  students.reduce(
                                                    (sum, c) =>
                                                      sum + c.completedLessons,
                                                    0,
                                                  );
                                                const totalStars =
                                                  students.reduce(
                                                    (sum, c) => sum + c.stars,
                                                    0,
                                                  );
                                                const maxPossibleLessons =
                                                  students.length * 7;
                                                return {
                                                  name: comp,
                                                  hocRate: maxPossibleLessons
                                                    ? Number(
                                                        (
                                                          (totalLessons /
                                                            maxPossibleLessons) *
                                                          100
                                                        ).toFixed(1),
                                                      )
                                                    : 0,
                                                  stars: totalStars,
                                                  studentCount: students.length,
                                                };
                                              })
                                              .sort(
                                                (a, b) => b.hocRate - a.hocRate,
                                              );

                                            const sessionNames = [
                                              {
                                                id: "buoiDinhHinh",
                                                label: "B.Định Hình",
                                              },
                                              { id: "buoi1", label: "Buổi 1" },
                                              { id: "buoi2", label: "Buổi 2" },
                                              { id: "buoi3", label: "Buổi 3" },
                                              { id: "buoi4", label: "Buổi 4" },
                                              { id: "buoi5", label: "Buổi 5" },
                                              { id: "buoi6", label: "Buổi 6" },
                                            ];

                                            const hdvListForChart = Array.from(
                                              new Set(
                                                sortedForAnalytics.map((c) =>
                                                  String(
                                                    c.guideName || "Chưa rõ",
                                                  ),
                                                ),
                                              ),
                                            );
                                            const hdvProgressStats =
                                              sessionNames.map((s) => {
                                                const result: any = {
                                                  name: s.label,
                                                };
                                                hdvListForChart.forEach(
                                                  (hdv: string) => {
                                                    const students =
                                                      sortedForAnalytics.filter(
                                                        (c) =>
                                                          String(
                                                            c.guideName ||
                                                              "Chưa rõ",
                                                          ) === hdv,
                                                      );
                                                    let hocCompleted = 0;
                                                    students.forEach((cv) => {
                                                      const track =
                                                        course.tracking?.[
                                                          cv.id
                                                        ]?.[s.id];
                                                      if (track?.hoc)
                                                        hocCompleted++;
                                                    });
                                                    result[hdv] =
                                                      students.length > 0
                                                        ? Number(
                                                            (
                                                              (hocCompleted /
                                                                students.length) *
                                                              100
                                                            ).toFixed(1),
                                                          )
                                                        : 0;
                                                  },
                                                );
                                                return result;
                                              });

                                            const totalStudents =
                                              sortedForAnalytics.length;
                                            const sessionStats =
                                              sessionNames.map((s) => {
                                                let hocCompleted = 0;
                                                let hanhSubmitted = 0;
                                                sortedForAnalytics.forEach(
                                                  (cv) => {
                                                    const track =
                                                      course.tracking?.[
                                                        cv.id
                                                      ]?.[s.id];
                                                    if (track?.hoc)
                                                      hocCompleted++;
                                                    const hanh = track?.hanh;
                                                    if (
                                                      hanh &&
                                                      [
                                                        "⭐",
                                                        "⭐⭐",
                                                        "❤️❤️❤️",
                                                      ].includes(hanh)
                                                    )
                                                      hanhSubmitted++;
                                                  },
                                                );
                                                return {
                                                  name: s.label,
                                                  hocRate:
                                                    totalStudents > 0
                                                      ? Number(
                                                          (
                                                            (hocCompleted /
                                                              totalStudents) *
                                                            100
                                                          ).toFixed(1),
                                                        )
                                                      : 0,
                                                  hanhRate:
                                                    totalStudents > 0
                                                      ? Number(
                                                          (
                                                            (hanhSubmitted /
                                                              totalStudents) *
                                                            100
                                                          ).toFixed(1),
                                                        )
                                                      : 0,
                                                  hocCompleted,
                                                  hanhSubmitted,
                                                };
                                              });

                                            const getAgeBucket = (
                                              ageInput:
                                                | string
                                                | number
                                                | undefined,
                                            ): string => {
                                              if (!ageInput) return "Chưa rõ";
                                              let age = Number(ageInput);
                                              if (isNaN(age)) {
                                                const match =
                                                  String(ageInput).match(/\d+/);
                                                if (match) {
                                                  age = Number(match[0]);
                                                } else {
                                                  return "Chưa rõ";
                                                }
                                              }
                                              if (
                                                age > 1900 &&
                                                age <= new Date().getFullYear()
                                              ) {
                                                age =
                                                  new Date().getFullYear() -
                                                  age;
                                              }
                                              if (age < 18) return "Dưới 18";
                                              if (age >= 18 && age < 30)
                                                return "18 - 30";
                                              if (age >= 30 && age < 35)
                                                return "30 - dưới 35";
                                              if (age >= 35 && age < 45)
                                                return "35 - dưới 45";
                                              if (age >= 45 && age < 60)
                                                return "45 - dưới 60";
                                              if (age >= 60) return "Trên 60";
                                              return "Chưa rõ";
                                            };

                                            const ageGroups =
                                              sortedForAnalytics.reduce(
                                                (acc, cv) => {
                                                  const bucket = getAgeBucket(
                                                    cv.age,
                                                  );
                                                  acc[bucket] =
                                                    (acc[bucket] || 0) + 1;
                                                  return acc;
                                                },
                                                {} as Record<string, number>,
                                              );

                                            const ageOrder = [
                                              "Dưới 18",
                                              "18 - 30",
                                              "30 - dưới 35",
                                              "35 - dưới 45",
                                              "45 - dưới 60",
                                              "Trên 60",
                                              "Chưa rõ",
                                            ];
                                            const ageStats = Object.entries(
                                              ageGroups,
                                            )
                                              .map(([name, value]) => ({
                                                name,
                                                value: Number(value),
                                              }))
                                              .sort((a, b) => {
                                                const idxA = ageOrder.indexOf(
                                                  a.name,
                                                );
                                                const idxB = ageOrder.indexOf(
                                                  b.name,
                                                );
                                                if (idxA !== -1 && idxB !== -1)
                                                  return idxA - idxB;
                                                if (idxA !== -1) return -1;
                                                if (idxB !== -1) return 1;
                                                return b.value - a.value;
                                              });

                                            const jobGroups =
                                              sortedForAnalytics.reduce(
                                                (acc, cv) => {
                                                  const job =
                                                    cv.job || "Chưa rõ";
                                                  acc[job] =
                                                    (acc[job] || 0) + 1;
                                                  return acc;
                                                },
                                                {} as Record<string, number>,
                                              );
                                            const jobStats = Object.entries(
                                              jobGroups,
                                            )
                                              .map(([name, value]) => ({
                                                name,
                                                value: Number(value),
                                              }))
                                              .sort(
                                                (a, b) => b.value - a.value,
                                              );

                                            const COLORS = [
                                              "#8b5cf6",
                                              "#3b82f6",
                                              "#10b981",
                                              "#f59e0b",
                                              "#ef4444",
                                              "#ec4899",
                                              "#64748b",
                                              "#14b8a6",
                                              "#84cc16",
                                            ];

                                            return (
                                              <div className="flex flex-col gap-8">
                                                <div className="flex justify-between items-center bg-purple-50 p-6 rounded-2xl border border-purple-100">
                                                  <div className="pr-4 border-r border-purple-200">
                                                    <h3 className="font-bold text-lg text-purple-900 mb-1 flex items-center gap-2">
                                                      <BookOpen
                                                        size={20}
                                                        className="text-purple-600"
                                                      />
                                                      Phân tích AI
                                                    </h3>
                                                    <p className="text-sm text-purple-700">
                                                      Trí tuệ nhân tạo sẽ phân
                                                      tích chỉ số học viên,
                                                      ngành nghề, độ tuổi và
                                                      theo dõi tiến độ để đưa ra
                                                      chiến lược phù hợp.
                                                    </p>
                                                  </div>
                                                  <button
                                                    disabled={isAnalyzing}
                                                    onClick={async () => {
                                                      const apiKey =
                                                        (import.meta as any).env
                                                          ?.VITE_GEMINI_API_KEY ||
                                                        process.env
                                                          .GEMINI_API_KEY;
                                                      if (!apiKey) {
                                                        setChromeAlert(
                                                          "Chưa cấu hình GEMINI_API_KEY trong hệ thống.",
                                                        );
                                                        return;
                                                      }
                                                      setIsAnalyzing(true);
                                                      setAiAnalysisResult(null);
                                                      try {
                                                        const ai =
                                                          new GoogleGenAI({
                                                            apiKey,
                                                          });
                                                        const data =
                                                          sortedForAnalytics.map(
                                                            (c) => ({
                                                              age: c.age,
                                                              job: c.job,
                                                              companion:
                                                                c.companion ||
                                                                "Chưa phân bổ",
                                                              group:
                                                                c.studyGroup ||
                                                                "Chưa nhóm",
                                                              completedLessons:
                                                                c.completedLessons,
                                                              stars: c.stars,
                                                            }),
                                                          );
                                                        const prompt = `Phân tích dữ liệu học tập ẩn danh của học viên khóa ${course.name}:\n\n${JSON.stringify(data)}\n\nYêu cầu phân tích chỉ số tuổi, phổ biến ngành nghề, và tổng kết hiệu suất thực hành/học tập từ dữ liệu trên. Từ đó, vui lòng gợi ý chiến lược ngắn gọn (trọng tâm vào vai trò người đồng hành và group học tập) nhằm tăng tỷ lệ duy trì và hiệu suất học tập. Hãy format response bằng markdown ngắn gọn.`;
                                                        const response =
                                                          await ai.models.generateContent(
                                                            {
                                                              model:
                                                                "gemini-2.5-flash",
                                                              contents: prompt,
                                                            },
                                                          );
                                                        setAiAnalysisResult(
                                                          response.text,
                                                        );
                                                      } catch (e) {
                                                        console.error(e);
                                                        setChromeAlert(
                                                          "Lỗi khi phân tích dữ liệu.",
                                                        );
                                                      } finally {
                                                        setIsAnalyzing(false);
                                                      }
                                                    }}
                                                    className="ml-6 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:from-purple-700 hover:to-indigo-700 shadow-lg shadow-purple-200 transition-all active:scale-95 whitespace-nowrap"
                                                  >
                                                    {isAnalyzing
                                                      ? "ĐANG PHÂN TÍCH..."
                                                      : "BẮT ĐẦU PHÂN TÍCH"}
                                                  </button>
                                                </div>

                                                {aiAnalysisResult && (
                                                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm overflow-auto markdown-body">
                                                    <div className="text-slate-700 text-sm leading-relaxed space-y-4">
                                                      {aiAnalysisResult
                                                        .split("\n")
                                                        .map((line, i) => {
                                                          if (!line.trim())
                                                            return null;

                                                          // Basic bold parsing
                                                          const parts =
                                                            line.split(
                                                              /(\*\*.*?\*\*)/g,
                                                            );

                                                          return (
                                                            <p
                                                              key={i}
                                                              className={
                                                                line.startsWith(
                                                                  "#",
                                                                ) ||
                                                                line.startsWith(
                                                                  "**",
                                                                )
                                                                  ? "mt-4"
                                                                  : "mt-1"
                                                              }
                                                            >
                                                              {parts.map(
                                                                (p, j) => {
                                                                  if (
                                                                    p.startsWith(
                                                                      "**",
                                                                    ) &&
                                                                    p.endsWith(
                                                                      "**",
                                                                    )
                                                                  ) {
                                                                    return (
                                                                      <strong
                                                                        key={j}
                                                                        className="font-bold text-slate-900"
                                                                      >
                                                                        {p.slice(
                                                                          2,
                                                                          -2,
                                                                        )}
                                                                      </strong>
                                                                    );
                                                                  }
                                                                  return p;
                                                                },
                                                              )}
                                                            </p>
                                                          );
                                                        })}
                                                    </div>
                                                  </div>
                                                )}

                                                <div className="flex flex-col gap-2">
                                                  <h3 className="font-bold text-lg text-slate-800">
                                                    Tiến độ theo từng Buổi (Học
                                                    & Hành)
                                                  </h3>
                                                  <div className="h-[300px] w-full border border-slate-200 rounded-xl p-4 bg-slate-50 mb-6">
                                                    <ResponsiveContainer
                                                      width="100%"
                                                      height="100%"
                                                    >
                                                      <BarChart
                                                        data={sessionStats}
                                                      >
                                                        <CartesianGrid
                                                          strokeDasharray="3 3"
                                                          vertical={false}
                                                          stroke="#E2E8F0"
                                                        />
                                                        <XAxis
                                                          dataKey="name"
                                                          tick={{
                                                            fontSize: 10,
                                                            fontWeight: "bold",
                                                          }}
                                                          stroke="#94A3B8"
                                                        />
                                                        <YAxis
                                                          tick={{
                                                            fontSize: 10,
                                                          }}
                                                          stroke="#94A3B8"
                                                          domain={[0, 100]}
                                                        />
                                                        <RechartsTooltip
                                                          wrapperStyle={{
                                                            zIndex: 1000,
                                                          }}
                                                          contentStyle={{
                                                            borderRadius: "8px",
                                                            border:
                                                              "1px solid #e2e8f0",
                                                            boxShadow:
                                                              "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                                                            backgroundColor:
                                                              "rgba(255, 255, 255, 0.98)",
                                                          }}
                                                        />
                                                        <Legend
                                                          wrapperStyle={{
                                                            fontSize: "10px",
                                                            fontWeight: "bold",
                                                          }}
                                                        />
                                                        <Bar
                                                          dataKey="hocRate"
                                                          name="Tỷ lệ Học (%)"
                                                          fill="#3b82f6"
                                                          radius={[4, 4, 0, 0]}
                                                          barSize={30}
                                                        />
                                                        <Bar
                                                          dataKey="hanhRate"
                                                          name="Tỷ lệ Hành (%)"
                                                          fill="#ec4899"
                                                          radius={[4, 4, 0, 0]}
                                                          barSize={30}
                                                        />
                                                      </BarChart>
                                                    </ResponsiveContainer>
                                                  </div>
                                                </div>

                                                <div className="flex flex-col gap-2">
                                                  <h3 className="font-bold text-lg text-slate-800">
                                                    Tiến độ học tập theo HDV (Tỷ
                                                    lệ Học %)
                                                  </h3>
                                                  <div className="h-[400px] w-full border border-slate-200 rounded-xl p-4 bg-slate-50 mb-6">
                                                    <ResponsiveContainer
                                                      width="100%"
                                                      height="100%"
                                                    >
                                                      <LineChart
                                                        data={hdvProgressStats}
                                                      >
                                                        <CartesianGrid
                                                          strokeDasharray="3 3"
                                                          vertical={false}
                                                          stroke="#E2E8F0"
                                                        />
                                                        <XAxis
                                                          dataKey="name"
                                                          tick={{
                                                            fontSize: 10,
                                                            fontWeight: "bold",
                                                          }}
                                                          stroke="#94A3B8"
                                                        />
                                                        <YAxis
                                                          tick={{
                                                            fontSize: 10,
                                                          }}
                                                          stroke="#94A3B8"
                                                          domain={[0, 100]}
                                                        />
                                                        <RechartsTooltip
                                                          wrapperStyle={{
                                                            zIndex: 1000,
                                                          }}
                                                          contentStyle={{
                                                            borderRadius: "8px",
                                                            border:
                                                              "1px solid #e2e8f0",
                                                            boxShadow:
                                                              "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                                                            backgroundColor:
                                                              "rgba(255, 255, 255, 0.98)",
                                                          }}
                                                        />
                                                        <Legend
                                                          wrapperStyle={{
                                                            fontSize: "10px",
                                                            fontWeight: "bold",
                                                          }}
                                                        />
                                                        {hdvListForChart.map(
                                                          (
                                                            hdv: string,
                                                            index: number,
                                                          ) => (
                                                            <Line
                                                              key={hdv}
                                                              type="monotone"
                                                              dataKey={hdv}
                                                              stroke={
                                                                COLORS[
                                                                  index %
                                                                    COLORS.length
                                                                ]
                                                              }
                                                              strokeWidth={2}
                                                              dot={{
                                                                r: 4,
                                                                strokeWidth: 2,
                                                              }}
                                                              activeDot={{
                                                                r: 6,
                                                              }}
                                                            />
                                                          ),
                                                        )}
                                                      </LineChart>
                                                    </ResponsiveContainer>
                                                  </div>
                                                </div>

                                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                                                  <div className="flex flex-col gap-2">
                                                    <h3 className="font-bold text-lg text-slate-800">
                                                      Hiệu suất theo Group học
                                                      tập
                                                    </h3>
                                                    <div className="h-[300px] w-full border border-slate-200 rounded-xl p-4 bg-slate-50">
                                                      <ResponsiveContainer
                                                        width="100%"
                                                        height="100%"
                                                      >
                                                        <BarChart
                                                          data={groupStats}
                                                        >
                                                          <CartesianGrid
                                                            strokeDasharray="3 3"
                                                            vertical={false}
                                                            stroke="#E2E8F0"
                                                          />
                                                          <XAxis
                                                            dataKey="name"
                                                            tick={{
                                                              fontSize: 10,
                                                              fontWeight:
                                                                "bold",
                                                            }}
                                                            stroke="#94A3B8"
                                                          />
                                                          <YAxis
                                                            yAxisId="left"
                                                            tick={{
                                                              fontSize: 10,
                                                            }}
                                                            stroke="#94A3B8"
                                                          />
                                                          <YAxis
                                                            yAxisId="right"
                                                            orientation="right"
                                                            tick={{
                                                              fontSize: 10,
                                                            }}
                                                            stroke="#94A3B8"
                                                          />
                                                          <RechartsTooltip
                                                            wrapperStyle={{
                                                              zIndex: 1000,
                                                            }}
                                                            contentStyle={{
                                                              borderRadius:
                                                                "8px",
                                                              border:
                                                                "1px solid #e2e8f0",
                                                              boxShadow:
                                                                "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                                                              backgroundColor:
                                                                "rgba(255, 255, 255, 0.98)",
                                                            }}
                                                          />
                                                          <Legend
                                                            wrapperStyle={{
                                                              fontSize: "10px",
                                                              fontWeight:
                                                                "bold",
                                                            }}
                                                          />
                                                          <Bar
                                                            yAxisId="left"
                                                            dataKey="hocRate"
                                                            name="Tỷ lệ Học (%)"
                                                            fill="#8b5cf6"
                                                            radius={[
                                                              4, 4, 0, 0,
                                                            ]}
                                                            barSize={20}
                                                          />
                                                          <Bar
                                                            yAxisId="right"
                                                            dataKey="stars"
                                                            name="Tổng Hành (Tim/Sao)"
                                                            fill="#fbbf24"
                                                            radius={[
                                                              4, 4, 0, 0,
                                                            ]}
                                                            barSize={20}
                                                          />
                                                        </BarChart>
                                                      </ResponsiveContainer>
                                                    </div>
                                                  </div>

                                                  <div className="flex flex-col gap-2">
                                                    <h3 className="font-bold text-lg text-slate-800">
                                                      Hiệu suất theo Người đồng
                                                      hành
                                                    </h3>
                                                    <div className="h-[300px] w-full border border-slate-200 rounded-xl p-4 bg-slate-50">
                                                      <ResponsiveContainer
                                                        width="100%"
                                                        height="100%"
                                                      >
                                                        <BarChart
                                                          data={companionStats}
                                                        >
                                                          <CartesianGrid
                                                            strokeDasharray="3 3"
                                                            vertical={false}
                                                            stroke="#E2E8F0"
                                                          />
                                                          <XAxis
                                                            dataKey="name"
                                                            tick={{
                                                              fontSize: 10,
                                                              fontWeight:
                                                                "bold",
                                                            }}
                                                            stroke="#94A3B8"
                                                          />
                                                          <YAxis
                                                            yAxisId="left"
                                                            tick={{
                                                              fontSize: 10,
                                                            }}
                                                            stroke="#94A3B8"
                                                          />
                                                          <YAxis
                                                            yAxisId="right"
                                                            orientation="right"
                                                            tick={{
                                                              fontSize: 10,
                                                            }}
                                                            stroke="#94A3B8"
                                                          />
                                                          <RechartsTooltip
                                                            wrapperStyle={{
                                                              zIndex: 1000,
                                                            }}
                                                            contentStyle={{
                                                              borderRadius:
                                                                "8px",
                                                              border:
                                                                "1px solid #e2e8f0",
                                                              boxShadow:
                                                                "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                                                              backgroundColor:
                                                                "rgba(255, 255, 255, 0.98)",
                                                            }}
                                                          />
                                                          <Legend
                                                            wrapperStyle={{
                                                              fontSize: "10px",
                                                              fontWeight:
                                                                "bold",
                                                            }}
                                                          />
                                                          <Bar
                                                            yAxisId="left"
                                                            dataKey="hocRate"
                                                            name="Tỷ lệ Học (%)"
                                                            fill="#10b981"
                                                            radius={[
                                                              4, 4, 0, 0,
                                                            ]}
                                                            barSize={20}
                                                          />
                                                          <Bar
                                                            yAxisId="right"
                                                            dataKey="stars"
                                                            name="Tổng Hành (Tim/Sao)"
                                                            fill="#fbbf24"
                                                            radius={[
                                                              4, 4, 0, 0,
                                                            ]}
                                                            barSize={20}
                                                          />
                                                        </BarChart>
                                                      </ResponsiveContainer>
                                                    </div>
                                                  </div>
                                                </div>

                                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mt-4">
                                                  <div className="flex flex-col gap-2">
                                                    <h3 className="font-bold text-lg text-slate-800">
                                                      Phân bố Nghề nghiệp
                                                    </h3>
                                                    <div className="h-[300px] w-full border border-slate-200 rounded-xl p-4 bg-slate-50 flex justify-center items-center">
                                                      <ResponsiveContainer
                                                        width="100%"
                                                        height="100%"
                                                      >
                                                        <PieChart>
                                                          <Pie
                                                            data={jobStats}
                                                            cx="50%"
                                                            cy="50%"
                                                            outerRadius={80}
                                                            fill="#8884d8"
                                                            dataKey="value"
                                                            label={({
                                                              name,
                                                              percent,
                                                            }) =>
                                                              `${name} ${(percent * 100).toFixed(0)}%`
                                                            }
                                                            labelLine={true}
                                                          >
                                                            {jobStats.map(
                                                              (
                                                                entry,
                                                                index,
                                                              ) => (
                                                                <Cell
                                                                  key={`cell-${index}`}
                                                                  fill={
                                                                    COLORS[
                                                                      index %
                                                                        COLORS.length
                                                                    ]
                                                                  }
                                                                />
                                                              ),
                                                            )}
                                                          </Pie>
                                                          <RechartsTooltip
                                                            wrapperStyle={{
                                                              zIndex: 1000,
                                                            }}
                                                            contentStyle={{
                                                              borderRadius:
                                                                "8px",
                                                              border:
                                                                "1px solid #e2e8f0",
                                                              boxShadow:
                                                                "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                                                              backgroundColor:
                                                                "rgba(255, 255, 255, 0.98)",
                                                            }}
                                                          />
                                                          <Legend
                                                            wrapperStyle={{
                                                              fontSize: "10px",
                                                              fontWeight:
                                                                "bold",
                                                            }}
                                                          />
                                                        </PieChart>
                                                      </ResponsiveContainer>
                                                    </div>
                                                  </div>

                                                  <div className="flex flex-col gap-2">
                                                    <h3 className="font-bold text-lg text-slate-800">
                                                      Phân bố Độ tuổi
                                                    </h3>
                                                    <div className="h-[300px] w-full border border-slate-200 rounded-xl p-4 bg-slate-50 flex justify-center items-center">
                                                      <ResponsiveContainer
                                                        width="100%"
                                                        height="100%"
                                                      >
                                                        <PieChart>
                                                          <Pie
                                                            data={ageStats}
                                                            cx="50%"
                                                            cy="50%"
                                                            outerRadius={80}
                                                            fill="#8884d8"
                                                            dataKey="value"
                                                            label={({
                                                              name,
                                                              percent,
                                                            }) =>
                                                              `${name} ${(percent * 100).toFixed(0)}%`
                                                            }
                                                            labelLine={true}
                                                          >
                                                            {ageStats.map(
                                                              (
                                                                entry,
                                                                index,
                                                              ) => (
                                                                <Cell
                                                                  key={`cell-${index}`}
                                                                  fill={
                                                                    COLORS[
                                                                      index %
                                                                        COLORS.length
                                                                    ]
                                                                  }
                                                                />
                                                              ),
                                                            )}
                                                          </Pie>
                                                          <RechartsTooltip
                                                            wrapperStyle={{
                                                              zIndex: 1000,
                                                            }}
                                                            contentStyle={{
                                                              borderRadius:
                                                                "8px",
                                                              border:
                                                                "1px solid #e2e8f0",
                                                              boxShadow:
                                                                "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                                                              backgroundColor:
                                                                "rgba(255, 255, 255, 0.98)",
                                                            }}
                                                          />
                                                          <Legend
                                                            wrapperStyle={{
                                                              fontSize: "10px",
                                                              fontWeight:
                                                                "bold",
                                                            }}
                                                          />
                                                        </PieChart>
                                                      </ResponsiveContainer>
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          } else if (
                                            courseDetailTab === "tracking"
                                          ) {
                                            return (
                                              <div className="flex flex-col gap-4">
                                                {isAdmin && (
                                                  <div className="flex flex-wrap items-center gap-4">
                                                    <button
                                                      onClick={() =>
                                                        setIsEditingTracking(
                                                          !isEditingTracking,
                                                        )
                                                      }
                                                      className={cn(
                                                        "px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center transition-all",
                                                        isEditingTracking
                                                          ? "bg-purple-600 text-white shadow-md shadow-purple-200"
                                                          : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                                                      )}
                                                    >
                                                      {isEditingTracking
                                                        ? "Lưu chỉnh sửa"
                                                        : "Chỉnh sửa"}
                                                    </button>
                                                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                                                      <button
                                                        onClick={() =>
                                                          setTableZoom(
                                                            Math.max(
                                                              50,
                                                              tableZoom - 10,
                                                            ),
                                                          )
                                                        }
                                                        className="w-8 h-8 flex items-center justify-center bg-white rounded-lg text-slate-600 font-black shadow-sm hover:bg-slate-50 transition-colors"
                                                      >
                                                        -
                                                      </button>
                                                      <span className="text-xs font-bold text-slate-700 w-12 text-center">
                                                        {tableZoom}%
                                                      </span>
                                                      <button
                                                        onClick={() =>
                                                          setTableZoom(
                                                            Math.min(
                                                              200,
                                                              tableZoom + 10,
                                                            ),
                                                          )
                                                        }
                                                        className="w-8 h-8 flex items-center justify-center bg-white rounded-lg text-slate-600 font-black shadow-sm hover:bg-slate-50 transition-colors"
                                                      >
                                                        +
                                                      </button>
                                                    </div>
                                                    <button
                                                      onClick={() =>
                                                        setIsTableExpanded(
                                                          !isTableExpanded,
                                                        )
                                                      }
                                                      className={cn(
                                                        "px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center transition-all",
                                                        isTableExpanded
                                                          ? "bg-slate-800 text-white shadow-md"
                                                          : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                                                      )}
                                                    >
                                                      {isTableExpanded
                                                        ? "Thu nhỏ bảng"
                                                        : "Mở rộng bảng"}
                                                    </button>
                                                    <button
                                                      onClick={() =>
                                                        setIsCustomizingTable(
                                                          !isCustomizingTable,
                                                        )
                                                      }
                                                      className={cn(
                                                        "px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center transition-all",
                                                        isCustomizingTable
                                                          ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                                                          : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                                                      )}
                                                    >
                                                      {isCustomizingTable
                                                        ? "Xong tùy chỉnh"
                                                        : "Tùy chỉnh cột"}
                                                    </button>
                                                    <button
                                                      onClick={() =>
                                                        setIsTrackingFilterVisible(
                                                          !isTrackingFilterVisible,
                                                        )
                                                      }
                                                      className={cn(
                                                        "px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center transition-all gap-2",
                                                        isTrackingFilterVisible
                                                          ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                                                          : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                                                      )}
                                                    >
                                                      <SlidersHorizontal
                                                        size={16}
                                                      />
                                                      {isTrackingFilterVisible
                                                        ? "Ẩn bộ lọc"
                                                        : "Lọc"}
                                                    </button>
                                                    {trackingHistory.length >
                                                      0 && (
                                                      <button
                                                        onClick={() =>
                                                          handleUndoTracking(
                                                            course.id,
                                                          )
                                                        }
                                                        title={`Hoàn tác (${trackingHistory.length})`}
                                                        className="w-10 h-10 rounded-xl flex items-center justify-center transition-all bg-orange-100 text-orange-600 hover:bg-orange-200"
                                                      >
                                                        <RotateCcw size={18} />
                                                      </button>
                                                    )}
                                                    {Object.values(
                                                      tableColumnConfig,
                                                    ).some(
                                                      (c: any) => c.hidden,
                                                    ) && (
                                                      <button
                                                        onClick={() => {
                                                          setTableColumnConfig(
                                                            (prev) => {
                                                              const reset = {
                                                                ...prev,
                                                              };
                                                              for (const key in reset) {
                                                                reset[
                                                                  key
                                                                ].hidden =
                                                                  false;
                                                              }
                                                              return reset;
                                                            },
                                                          );
                                                        }}
                                                        className="px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center transition-all bg-green-100 text-green-700 hover:bg-green-200"
                                                      >
                                                        Khôi phục cột ẩn
                                                      </button>
                                                    )}
                                                    {isEditingTracking && (
                                                      <div className="flex flex-wrap items-center gap-6 bg-slate-50 px-4 py-2 border border-slate-200 rounded-xl">
                                                        <div className="flex items-center gap-3">
                                                          <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">
                                                            Tem thẻ Học:
                                                          </span>
                                                          <div className="flex gap-1.5">
                                                            {[
                                                              {
                                                                value: true,
                                                                label: "✅",
                                                              },
                                                              {
                                                                value: false,
                                                                label: "❌",
                                                              },
                                                              {
                                                                value: null,
                                                                label: "Trống",
                                                              },
                                                            ].map((opt) => (
                                                              <button
                                                                key={String(
                                                                  opt.value,
                                                                )}
                                                                onClick={() =>
                                                                  setTrackingStampHoc(
                                                                    opt.value,
                                                                  )
                                                                }
                                                                className={cn(
                                                                  "px-3 py-1.5 rounded-lg text-sm font-bold border transition-all",
                                                                  trackingStampHoc ===
                                                                    opt.value
                                                                    ? "bg-white border-blue-400 shadow-sm ring-2 ring-blue-100"
                                                                    : "bg-transparent border-transparent hover:bg-slate-200 text-slate-500",
                                                                )}
                                                              >
                                                                {opt.label}
                                                              </button>
                                                            ))}
                                                          </div>
                                                        </div>
                                                        <div className="w-px h-6 bg-slate-300"></div>
                                                        <div className="flex items-center gap-3">
                                                          <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">
                                                            Tem thẻ LT, TH, T.Gian:
                                                          </span>
                                                          <div className="flex gap-1.5">
                                                            {[
                                                              {
                                                                value: "🖤",
                                                                label: "🖤",
                                                              },
                                                              {
                                                                value: "⭐",
                                                                label: "⭐",
                                                              },
                                                              {
                                                                value: "❤️",
                                                                label: "❤️",
                                                              },
                                                              {
                                                                value: "",
                                                                label: "Trống",
                                                              },
                                                            ].map((opt) => (
                                                              <button
                                                                key={opt.value}
                                                                onClick={() =>
                                                                  setTrackingStampHanh(
                                                                    opt.value,
                                                                  )
                                                                }
                                                                className={cn(
                                                                  "px-3 py-1.5 rounded-lg text-sm font-bold border transition-all",
                                                                  trackingStampHanh ===
                                                                    opt.value
                                                                    ? "bg-white border-purple-400 shadow-sm ring-2 ring-purple-100"
                                                                    : "bg-transparent border-transparent hover:bg-slate-200 text-slate-500",
                                                                )}
                                                              >
                                                                {opt.label}
                                                              </button>
                                                            ))}
                                                          </div>
                                                        </div>
                                                      </div>
                                                    )}
                                                  </div>
                                                )}
                                                <div
                                                  className={cn(
                                                    "overflow-auto border border-slate-200 hide-scrollbar",
                                                    isTableExpanded
                                                      ? "fixed inset-0 z-[60] bg-white p-4 max-h-screen"
                                                      : "rounded-xl max-h-[70vh]",
                                                  )}
                                                >
                                                  {isTableExpanded &&
                                                    isAdmin && (
                                                      <div className="flex flex-wrap items-center gap-4 mb-4">
                                                        <button
                                                          onClick={() =>
                                                            setIsEditingTracking(
                                                              !isEditingTracking,
                                                            )
                                                          }
                                                          className={cn(
                                                            "px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center transition-all",
                                                            isEditingTracking
                                                              ? "bg-purple-600 text-white shadow-md shadow-purple-200"
                                                              : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                                                          )}
                                                        >
                                                          {isEditingTracking
                                                            ? "Lưu chỉnh sửa"
                                                            : "Chỉnh sửa"}
                                                        </button>
                                                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                                                          <button
                                                            onClick={() =>
                                                              setTableZoom(
                                                                Math.max(
                                                                  50,
                                                                  tableZoom -
                                                                    10,
                                                                ),
                                                              )
                                                            }
                                                            className="w-8 h-8 flex items-center justify-center bg-white rounded-lg text-slate-600 font-black shadow-sm hover:bg-slate-50 transition-colors"
                                                          >
                                                            -
                                                          </button>
                                                          <span className="text-xs font-bold text-slate-700 w-12 text-center">
                                                            {tableZoom}%
                                                          </span>
                                                          <button
                                                            onClick={() =>
                                                              setTableZoom(
                                                                Math.min(
                                                                  200,
                                                                  tableZoom +
                                                                    10,
                                                                ),
                                                              )
                                                            }
                                                            className="w-8 h-8 flex items-center justify-center bg-white rounded-lg text-slate-600 font-black shadow-sm hover:bg-slate-50 transition-colors"
                                                          >
                                                            +
                                                          </button>
                                                        </div>
                                                        <button
                                                          onClick={() =>
                                                            setIsTableExpanded(
                                                              !isTableExpanded,
                                                            )
                                                          }
                                                          className={cn(
                                                            "px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center transition-all",
                                                            isTableExpanded
                                                              ? "bg-slate-800 text-white shadow-md"
                                                              : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                                                          )}
                                                        >
                                                          {isTableExpanded
                                                            ? "Thu nhỏ bảng"
                                                            : "Mở rộng bảng"}
                                                        </button>
                                                        <button
                                                          onClick={() =>
                                                            setIsCustomizingTable(
                                                              !isCustomizingTable,
                                                            )
                                                          }
                                                          className={cn(
                                                            "px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center transition-all",
                                                            isCustomizingTable
                                                              ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                                                              : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                                                          )}
                                                        >
                                                          {isCustomizingTable
                                                            ? "Xong tùy chỉnh"
                                                            : "Tùy chỉnh cột"}
                                                        </button>
                                                        <button
                                                          onClick={() =>
                                                            setIsTrackingFilterVisible(
                                                              !isTrackingFilterVisible,
                                                            )
                                                          }
                                                          className={cn(
                                                            "px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center transition-all gap-2",
                                                            isTrackingFilterVisible
                                                              ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                                                              : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                                                          )}
                                                        >
                                                          <SlidersHorizontal
                                                            size={16}
                                                          />
                                                          {isTrackingFilterVisible
                                                            ? "Ẩn bộ lọc"
                                                            : "Lọc"}
                                                        </button>
                                                        {trackingHistory.length >
                                                          0 && (
                                                          <button
                                                            onClick={() =>
                                                              handleUndoTracking(
                                                                course.id,
                                                              )
                                                            }
                                                            title={`Hoàn tác (${trackingHistory.length})`}
                                                            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all bg-orange-100 text-orange-600 hover:bg-orange-200"
                                                          >
                                                            <RotateCcw
                                                              size={18}
                                                            />
                                                          </button>
                                                        )}
                                                        {Object.values(
                                                          tableColumnConfig,
                                                        ).some(
                                                          (c: any) => c.hidden,
                                                        ) && (
                                                          <button
                                                            onClick={() => {
                                                              setTableColumnConfig(
                                                                (prev) => {
                                                                  const reset =
                                                                    { ...prev };
                                                                  for (const key in reset) {
                                                                    reset[
                                                                      key
                                                                    ].hidden =
                                                                      false;
                                                                  }
                                                                  return reset;
                                                                },
                                                              );
                                                            }}
                                                            className="px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center transition-all bg-green-100 text-green-700 hover:bg-green-200"
                                                          >
                                                            Khôi phục cột ẩn
                                                          </button>
                                                        )}
                                                        {isEditingTracking && (
                                                          <div className="flex flex-wrap items-center gap-6 bg-slate-50 px-4 py-2 border border-slate-200 rounded-xl">
                                                            <div className="flex items-center gap-3">
                                                              <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">
                                                                Tem thẻ Học:
                                                              </span>
                                                              <div className="flex gap-1.5">
                                                                {[
                                                                  {
                                                                    value: true,
                                                                    label: "✅",
                                                                  },
                                                                  {
                                                                    value: false,
                                                                    label: "❌",
                                                                  },
                                                                  {
                                                                    value: null,
                                                                    label:
                                                                      "Trống",
                                                                  },
                                                                ].map((opt) => (
                                                                  <button
                                                                    key={String(
                                                                      opt.value,
                                                                    )}
                                                                    onClick={() =>
                                                                      setTrackingStampHoc(
                                                                        opt.value,
                                                                      )
                                                                    }
                                                                    className={cn(
                                                                      "px-3 py-1.5 rounded-lg text-sm font-bold border transition-all",
                                                                      trackingStampHoc ===
                                                                        opt.value
                                                                        ? "bg-white border-blue-400 shadow-sm ring-2 ring-blue-100"
                                                                        : "bg-transparent border-transparent hover:bg-slate-200 text-slate-500",
                                                                    )}
                                                                  >
                                                                    {opt.label}
                                                                  </button>
                                                                ))}
                                                              </div>
                                                            </div>
                                                            <div className="w-px h-6 bg-slate-300"></div>
                                                            <div className="flex items-center gap-3">
                                                              <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">
                                                                TEM THẺ LT, TH, T.GIAN:
                                                              </span>
                                                              <div className="flex gap-1.5">
                                                                {[
                                                                  {
                                                                    value: "🖤",
                                                                    label: "🖤",
                                                                  },
                                                                  {
                                                                    value: "⭐",
                                                                    label: "⭐",
                                                                  },
                                                                  {
                                                                    value: "❤️",
                                                                    label: "❤️",
                                                                  },
                                                                  {
                                                                    value: "",
                                                                    label: "Trống",
                                                                  },
                                                                ].map((opt) => (
                                                                  <button
                                                                    key={opt.value}
                                                                    onClick={() =>
                                                                      setTrackingStampHanh(
                                                                        opt.value,
                                                                      )
                                                                    }
                                                                    className={cn(
                                                                      "px-3 py-1.5 rounded-lg text-sm font-bold border transition-all",
                                                                      trackingStampHanh === opt.value
                                                                        ? "bg-white border-purple-400 shadow-sm ring-2 ring-purple-100"
                                                                        : "bg-transparent border-transparent hover:bg-slate-200 text-slate-500",
                                                                    )}
                                                                  >
                                                                    {opt.label}
                                                                  </button>
                                                                ))}
                                                              </div>
                                                            </div>
                                                          </div>
                                                        )}
                                                      </div>
                                                    )}
                                                  <div
                                                    className={cn(
                                                      "overflow-x-auto",
                                                      isTableExpanded
                                                        ? "max-h-[calc(100vh-100px)]"
                                                        : "max-h-full",
                                                    )}
                                                  >
                                                    <table
                                                      className="w-full text-sm text-left whitespace-nowrap uppercase"
                                                      style={{
                                                        fontFamily:
                                                          '"Google Sans", sans-serif',
                                                        zoom: tableZoom / 100,
                                                      }}
                                                    >
                                                      <thead
                                                        className={cn(
                                                          "text-[10px] uppercase font-black text-slate-800 text-center z-40 shadow-sm shadow-slate-200",
                                                          isHeaderFixed
                                                            ? "sticky top-0"
                                                            : "",
                                                        )}
                                                      >
                                                        <tr>
                                                          <th
                                                            colSpan={
                                                              isAdmin &&
                                                              isEditingTracking
                                                                ? 23
                                                                : 22
                                                            }
                                                            className="py-2 border-b border-r border-[#E2E8F0] bg-[#FFFF00]"
                                                          >
                                                            DANH SÁCH ĐĂNG KÝ
                                                            HỌC {course.name}
                                                          </th>
                                                        </tr>
                                                        <tr>
                                                          <th
                                                            style={getColumnStyle(
                                                              "stt",
                                                              true,
                                                            )}
                                                            className={getColumnClass(
                                                              "stt",
                                                              "px-2 py-1 border-r border-[#E2E8F0] bg-[#CCE5CC] align-middle",
                                                            )}
                                                            rowSpan={2}
                                                          >
                                                            <div className="flex items-center justify-center gap-1">
                                                              STT
                                                              {renderColumnMenu(
                                                                "stt",
                                                              )}
                                                            </div>
                                                          </th>
                                                          <th
                                                            style={getColumnStyle(
                                                              "companion",
                                                              true,
                                                            )}
                                                            className={getColumnClass(
                                                              "companion",
                                                              "px-2 py-1 border-r border-[#E2E8F0] bg-[#CCE5CC] align-middle",
                                                            )}
                                                            rowSpan={2}
                                                          >
                                                            <div className="flex items-center justify-center gap-1">
                                                              NGƯỜI ĐỒNG HÀNH
                                                              {renderColumnMenu(
                                                                "companion",
                                                              )}
                                                            </div>
                                                            {isTrackingFilterVisible && (
                                                              <input
                                                                type="text"
                                                                placeholder="Lọc..."
                                                                className="mt-1 block w-20 text-[8px] px-1 py-0.5 text-black rounded border border-slate-300 font-normal m-auto outline-none focus:border-blue-400 normal-case"
                                                                value={
                                                                  trackingFilters.companion
                                                                }
                                                                onChange={(e) =>
                                                                  setTrackingFilters(
                                                                    (f) => ({
                                                                      ...f,
                                                                      companion:
                                                                        e.target
                                                                          .value,
                                                                    }),
                                                                  )
                                                                }
                                                              />
                                                            )}
                                                          </th>
                                                          <th
                                                            style={getColumnStyle(
                                                              "studentId",
                                                              true,
                                                            )}
                                                            className={getColumnClass(
                                                              "studentId",
                                                              "px-2 py-1 border-r border-[#E2E8F0] bg-[#CCE5CC] align-middle",
                                                            )}
                                                            rowSpan={2}
                                                          >
                                                            <div className="flex items-center justify-center gap-1">
                                                              MÃ HỌC VIÊN
                                                              {renderColumnMenu(
                                                                "studentId",
                                                              )}
                                                            </div>
                                                            {isTrackingFilterVisible && (
                                                              <input
                                                                type="text"
                                                                placeholder="Lọc..."
                                                                className="mt-1 block w-16 text-[8px] px-1 py-0.5 text-black rounded border border-slate-300 font-normal m-auto outline-none focus:border-blue-400 normal-case"
                                                                value={
                                                                  trackingFilters.studentId
                                                                }
                                                                onChange={(e) =>
                                                                  setTrackingFilters(
                                                                    (f) => ({
                                                                      ...f,
                                                                      studentId:
                                                                        e.target
                                                                          .value,
                                                                    }),
                                                                  )
                                                                }
                                                              />
                                                            )}
                                                          </th>
                                                          <th
                                                            style={getColumnStyle(
                                                              "fullName",
                                                              true,
                                                            )}
                                                            className={getColumnClass(
                                                              "fullName",
                                                              "px-2 py-1 border-r border-[#E2E8F0] bg-[#B3D4FF] align-middle",
                                                            )}
                                                            rowSpan={2}
                                                          >
                                                            <div className="flex items-center justify-center gap-1">
                                                              HỌ TÊN
                                                              {renderColumnMenu(
                                                                "fullName",
                                                              )}
                                                            </div>
                                                            {isTrackingFilterVisible && (
                                                              <input
                                                                type="text"
                                                                placeholder="Lọc..."
                                                                className="mt-1 block w-20 text-[8px] px-1 py-0.5 text-black rounded border border-slate-300 font-normal m-auto outline-none focus:border-blue-400 normal-case"
                                                                value={
                                                                  trackingFilters.fullName
                                                                }
                                                                onChange={(e) =>
                                                                  setTrackingFilters(
                                                                    (f) => ({
                                                                      ...f,
                                                                      fullName:
                                                                        e.target
                                                                          .value,
                                                                    }),
                                                                  )
                                                                }
                                                              />
                                                            )}
                                                          </th>
                                                          <th
                                                            style={getColumnStyle(
                                                              "age",
                                                              true,
                                                            )}
                                                            className={getColumnClass(
                                                              "age",
                                                              "px-2 py-1 border-r border-[#E2E8F0] bg-[#B3D4FF] align-middle",
                                                            )}
                                                            rowSpan={2}
                                                          >
                                                            <div className="flex items-center justify-center gap-1">
                                                              TUỔI
                                                              {renderColumnMenu(
                                                                "age",
                                                              )}
                                                            </div>
                                                            {isTrackingFilterVisible && (
                                                              <input
                                                                type="text"
                                                                placeholder="Lọc..."
                                                                className="mt-1 block w-10 text-[8px] px-1 py-0.5 text-black rounded border border-slate-300 font-normal m-auto outline-none focus:border-blue-400 normal-case"
                                                                value={
                                                                  trackingFilters.age
                                                                }
                                                                onChange={(e) =>
                                                                  setTrackingFilters(
                                                                    (f) => ({
                                                                      ...f,
                                                                      age: e
                                                                        .target
                                                                        .value,
                                                                    }),
                                                                  )
                                                                }
                                                              />
                                                            )}
                                                          </th>
                                                          <th
                                                            style={getColumnStyle(
                                                              "guideName",
                                                              true,
                                                            )}
                                                            className={getColumnClass(
                                                              "guideName",
                                                              "px-2 py-1 border-r border-[#E2E8F0] bg-[#E5CCFF] align-middle text-left",
                                                            )}
                                                            rowSpan={2}
                                                          >
                                                            <div className="flex items-center justify-start gap-1">
                                                              HDV
                                                              {renderColumnMenu(
                                                                "guideName",
                                                              )}
                                                            </div>
                                                            {isTrackingFilterVisible && (
                                                              <input
                                                                type="text"
                                                                placeholder="Lọc..."
                                                                className="mt-1 block w-16 text-[8px] px-1 py-0.5 text-black rounded border border-slate-300 font-normal m-auto outline-none focus:border-blue-400 normal-case"
                                                                value={
                                                                  trackingFilters.guideName
                                                                }
                                                                onChange={(e) =>
                                                                  setTrackingFilters(
                                                                    (f) => ({
                                                                      ...f,
                                                                      guideName:
                                                                        e.target
                                                                          .value,
                                                                    }),
                                                                  )
                                                                }
                                                              />
                                                            )}
                                                          </th>
                                                          <th
                                                            style={getColumnStyle(
                                                              "studyGroup",
                                                              true,
                                                            )}
                                                            className={getColumnClass(
                                                              "studyGroup",
                                                              "px-2 py-1 border-r border-[#E2E8F0] bg-[#E5CCFF] align-middle",
                                                            )}
                                                            rowSpan={2}
                                                          >
                                                            <div className="flex items-center justify-center gap-1">
                                                              GROUP HỌC TẬP
                                                              {renderColumnMenu(
                                                                "studyGroup",
                                                              )}
                                                            </div>
                                                            {isTrackingFilterVisible && (
                                                              <input
                                                                type="text"
                                                                placeholder="Lọc..."
                                                                className="mt-1 block w-20 text-[8px] px-1 py-0.5 text-black rounded border border-slate-300 font-normal m-auto outline-none focus:border-blue-400 normal-case"
                                                                value={
                                                                  trackingFilters.studyGroup
                                                                }
                                                                onChange={(e) =>
                                                                  setTrackingFilters(
                                                                    (f) => ({
                                                                      ...f,
                                                                      studyGroup:
                                                                        e.target
                                                                          .value,
                                                                    }),
                                                                  )
                                                                }
                                                              />
                                                            )}
                                                          </th>
                                                          <th
                                                            style={getColumnStyle(
                                                              "fbLink",
                                                              true,
                                                            )}
                                                            className={getColumnClass(
                                                              "fbLink",
                                                              "px-2 py-1 border-r border-[#E2E8F0] bg-[#E5CCFF] align-middle",
                                                            )}
                                                            rowSpan={2}
                                                          >
                                                            <div className="flex items-center justify-center gap-1">
                                                              FACEBOOK
                                                              {renderColumnMenu(
                                                                "fbLink",
                                                              )}
                                                            </div>
                                                          </th>
                                                          {[
                                                            {
                                                              id: "buoiDinhHinh",
                                                              label:
                                                                "BUỔI ĐỊNH HÌNH",
                                                            },
                                                            {
                                                              id: "buoi1",
                                                              label: "BUỔI 1",
                                                            },
                                                            {
                                                              id: "buoi2",
                                                              label: "BUỔI 2",
                                                            },
                                                            {
                                                              id: "buoi3",
                                                              label: "BUỔI 3",
                                                            },
                                                            {
                                                              id: "buoi4",
                                                              label: "BUỔI 4",
                                                            },
                                                            {
                                                              id: "buoi5",
                                                              label: "BUỔI 5",
                                                            },
                                                            {
                                                              id: "buoi6",
                                                              label: "BUỔI 6",
                                                            },
                                                          ].map((b) => (
                                                            <th
                                                              key={b.id}
                                                              colSpan={4}
                                                              className="px-2 py-1 border-r border-[#E2E8F0] bg-[#FFE699]"
                                                            >
                                                              {b.label}
                                                            </th>
                                                          ))}
                                                          {isAdmin &&
                                                            isEditingTracking && (
                                                              <th
                                                                rowSpan={2}
                                                                className="px-2 py-1 border-r border-[#E2E8F0] bg-red-100 text-red-600 align-middle"
                                                              >
                                                                XÓA
                                                              </th>
                                                            )}
                                                        </tr>
                                                        <tr>
                                                          {[
                                                            {
                                                              id: "buoiDinhHinh",
                                                            },
                                                            { id: "buoi1" },
                                                            { id: "buoi2" },
                                                            { id: "buoi3" },
                                                            { id: "buoi4" },
                                                            { id: "buoi5" },
                                                            { id: "buoi6" },
                                                          ].map((b) => {
                                                            const renderHocHanhFilterMenu =
                                                              (
                                                                bId: string,
                                                                type:
                                                                  | "hoc"
                                                                  | "lt"
                                                                  | "th"
                                                                  | "timely",
                                                              ) => {
                                                                if (
                                                                  !isTrackingFilterVisible
                                                                )
                                                                  return null;
                                                                const filterKey = `${bId}_${type}`;
                                                                const options =
                                                                  type ===
                                                                    "hoc" ||
                                                                  type ===
                                                                    "timely"
                                                                    ? [
                                                                        "✅",
                                                                        "❌",
                                                                        "Trống",
                                                                      ]
                                                                    : [
                                                                        "🖤",
                                                                        "⭐",
                                                                        "⭐⭐",
                                                                        "❤️❤️❤️",
                                                                        "Trống",
                                                                      ];
                                                                const selectedVals: string[] =
                                                                  Array.isArray(
                                                                    trackingFilters[
                                                                      filterKey
                                                                    ],
                                                                  )
                                                                    ? trackingFilters[
                                                                        filterKey
                                                                      ]
                                                                    : [];
                                                                const isActive =
                                                                  activeFilterMenu ===
                                                                  filterKey;

                                                                return (
                                                                  <div className="relative mt-1">
                                                                    <button
                                                                      onClick={(
                                                                        e,
                                                                      ) => {
                                                                        e.stopPropagation();
                                                                        setActiveFilterMenu(
                                                                          isActive
                                                                            ? null
                                                                            : filterKey,
                                                                        );
                                                                      }}
                                                                      className={cn(
                                                                        "bg-white border rounded px-1.5 py-0.5 text-[8px] text-slate-600 flex items-center justify-between min-w-[32px] m-auto normal-case hover:border-blue-400 font-normal",
                                                                        selectedVals.length >
                                                                          0
                                                                          ? "border-blue-500 bg-blue-50 text-blue-700"
                                                                          : "border-slate-300",
                                                                      )}
                                                                    >
                                                                      {selectedVals.length >
                                                                      0
                                                                        ? `Lọc(${selectedVals.length})`
                                                                        : "Lọc..."}
                                                                    </button>
                                                                    {isActive && (
                                                                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-[100px] bg-white border border-slate-200 rounded-lg shadow-xl z-[90] py-1 text-left font-normal normal-case text-[10px] font-sans">
                                                                        <div className="flex flex-col max-h-48 overflow-y-auto hide-scrollbar">
                                                                          {options.map(
                                                                            (
                                                                              opt,
                                                                            ) => (
                                                                              <label
                                                                                key={
                                                                                  opt
                                                                                }
                                                                                className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer"
                                                                              >
                                                                                <input
                                                                                  type="checkbox"
                                                                                  checked={selectedVals.includes(
                                                                                    opt,
                                                                                  )}
                                                                                  onChange={(
                                                                                    e,
                                                                                  ) => {
                                                                                    const checked =
                                                                                      e
                                                                                        .target
                                                                                        .checked;
                                                                                    setTrackingFilters(
                                                                                      (
                                                                                        f,
                                                                                      ) => {
                                                                                        const current =
                                                                                          Array.isArray(
                                                                                            f[
                                                                                              filterKey
                                                                                            ],
                                                                                          )
                                                                                            ? f[
                                                                                                filterKey
                                                                                              ]
                                                                                            : [];
                                                                                        const newArr =
                                                                                          checked
                                                                                            ? [
                                                                                                ...current,
                                                                                                opt,
                                                                                              ]
                                                                                            : current.filter(
                                                                                                (
                                                                                                  x,
                                                                                                ) =>
                                                                                                  x !==
                                                                                                  opt,
                                                                                              );
                                                                                        return {
                                                                                          ...f,
                                                                                          [filterKey]:
                                                                                            newArr,
                                                                                        };
                                                                                      },
                                                                                    );
                                                                                  }}
                                                                                  className="rounded border-slate-300"
                                                                                />
                                                                                <span>
                                                                                  {
                                                                                    opt
                                                                                  }
                                                                                </span>
                                                                              </label>
                                                                            ),
                                                                          )}
                                                                        </div>
                                                                        {selectedVals.length >
                                                                          0 && (
                                                                          <div className="px-2 pt-1 border-t border-slate-100 mt-1">
                                                                            <button
                                                                              onClick={() =>
                                                                                setTrackingFilters(
                                                                                  (
                                                                                    f,
                                                                                  ) => ({
                                                                                    ...f,
                                                                                    [filterKey]:
                                                                                      [],
                                                                                  }),
                                                                                )
                                                                              }
                                                                              className="text-red-500 hover:text-red-600 font-bold block w-full text-center py-1"
                                                                            >
                                                                              Xóa
                                                                              lọc
                                                                            </button>
                                                                          </div>
                                                                        )}
                                                                      </div>
                                                                    )}
                                                                  </div>
                                                                );
                                                              };

                                                            return (
                                                              <React.Fragment
                                                                key={b.id}
                                                              >
                                                                <th className="px-1 py-1 border-r border-t border-[#E2E8F0] bg-[#FFE699]">
                                                                  <div className="flex flex-col items-center gap-1 font-bold">
                                                                    <span>
                                                                      HỌC
                                                                    </span>
                                                                    {renderHocHanhFilterMenu(
                                                                      b.id,
                                                                      "hoc",
                                                                    )}
                                                                  </div>
                                                                </th>
                                                                <th className="px-1 py-1 border-r border-t border-[#E2E8F0] bg-[#FFE699]">
                                                                  <div className="flex flex-col items-center gap-1 font-bold">
                                                                    <span>
                                                                      LT
                                                                    </span>
                                                                    {renderHocHanhFilterMenu(
                                                                      b.id,
                                                                      "lt",
                                                                    )}
                                                                  </div>
                                                                </th>
                                                                <th className="px-1 py-1 border-r border-t border-[#E2E8F0] bg-[#FFE699]">
                                                                  <div className="flex flex-col items-center gap-1 font-bold">
                                                                    <span>
                                                                      TH
                                                                    </span>
                                                                    {renderHocHanhFilterMenu(
                                                                      b.id,
                                                                      "th",
                                                                    )}
                                                                  </div>
                                                                </th>
                                                                <th className="px-1 py-1 border-r border-t border-[#E2E8F0] bg-[#FFE699]">
                                                                  <div className="flex flex-col items-center gap-1 font-bold">
                                                                    <div className="relative">
                                                                      <Clock size={16} className="text-amber-600" />
                                                                    </div>
                                                                    {renderHocHanhFilterMenu(
                                                                      b.id,
                                                                      "timely",
                                                                    )}
                                                                  </div>
                                                                </th>
                                                              </React.Fragment>
                                                            );
                                                          })}
                                                        </tr>
                                                      </thead>
                                                      <tbody className="text-[10px]">
                                                        {(() => {
                                                          const sessionsIds = [
                                                            "buoiDinhHinh",
                                                            "buoi1",
                                                            "buoi2",
                                                            "buoi3",
                                                            "buoi4",
                                                            "buoi5",
                                                            "buoi6",
                                                          ];
                                                          const sorted = [
                                                            ...searchedCvs,
                                                          ]
                                                            .filter((cv) => {
                                                              if (
                                                                trackingFilters.companion &&
                                                                !(
                                                                  cv.companion ||
                                                                  ""
                                                                )
                                                                  .toLowerCase()
                                                                  .includes(
                                                                    trackingFilters.companion.toLowerCase(),
                                                                  )
                                                              )
                                                                return false;
                                                              if (
                                                                trackingFilters.studentId &&
                                                                !(
                                                                  cv.studentId ||
                                                                  ""
                                                                )
                                                                  .toLowerCase()
                                                                  .includes(
                                                                    trackingFilters.studentId.toLowerCase(),
                                                                  )
                                                              )
                                                                return false;
                                                              if (
                                                                trackingFilters.fullName &&
                                                                !(
                                                                  cv.fullName ||
                                                                  ""
                                                                )
                                                                  .toLowerCase()
                                                                  .includes(
                                                                    trackingFilters.fullName.toLowerCase(),
                                                                  )
                                                              )
                                                                return false;
                                                              if (
                                                                trackingFilters.age &&
                                                                !(cv.age || "")
                                                                  .toLowerCase()
                                                                  .includes(
                                                                    trackingFilters.age.toLowerCase(),
                                                                  )
                                                              )
                                                                return false;
                                                              if (
                                                                trackingFilters.guideName &&
                                                                !(
                                                                  cv.guideName ||
                                                                  ""
                                                                )
                                                                  .toLowerCase()
                                                                  .includes(
                                                                    trackingFilters.guideName.toLowerCase(),
                                                                  )
                                                              )
                                                                return false;
                                                              if (
                                                                trackingFilters.studyGroup &&
                                                                !(
                                                                  cv.studyGroup ||
                                                                  ""
                                                                )
                                                                  .toLowerCase()
                                                                  .includes(
                                                                    trackingFilters.studyGroup.toLowerCase(),
                                                                  )
                                                              )
                                                                return false;

                                                              const track =
                                                                course
                                                                  .tracking?.[
                                                                  cv.id
                                                                ] || {};
                                                              for (const sId of sessionsIds) {
                                                                const fHoc =
                                                                  trackingFilters[
                                                                    `${sId}_hoc`
                                                                  ];
                                                                if (
                                                                  fHoc &&
                                                                  Array.isArray(
                                                                    fHoc,
                                                                  ) &&
                                                                  fHoc.length >
                                                                    0
                                                                ) {
                                                                  const hocVal =
                                                                    track[sId]
                                                                      ?.hoc;
                                                                  const strVal =
                                                                    hocVal ===
                                                                    true
                                                                      ? "✅"
                                                                      : hocVal ===
                                                                          false
                                                                        ? "❌"
                                                                        : "Trống";
                                                                  if (
                                                                    !fHoc.includes(
                                                                      strVal,
                                                                    )
                                                                  )
                                                                    return false;
                                                                } else if (
                                                                  fHoc &&
                                                                  typeof fHoc ===
                                                                    "string"
                                                                ) {
                                                                  const hocVal =
                                                                    track[sId]
                                                                      ?.hoc;
                                                                  const strVal =
                                                                    hocVal ===
                                                                    true
                                                                      ? "✅"
                                                                      : hocVal ===
                                                                          false
                                                                        ? "❌"
                                                                        : "";
                                                                  const vLower =
                                                                    fHoc.toLowerCase();
                                                                  if (
                                                                    !strVal.includes(
                                                                      vLower,
                                                                    ) &&
                                                                    !(
                                                                      vLower ===
                                                                        "v" &&
                                                                      hocVal ===
                                                                        true
                                                                    ) &&
                                                                    !(
                                                                      vLower ===
                                                                        "x" &&
                                                                      hocVal ===
                                                                        false
                                                                    )
                                                                  )
                                                                    return false;
                                                                }

                                                                const fLt =
                                                                  trackingFilters[
                                                                    `${sId}_lt`
                                                                  ];
                                                                if (
                                                                  fLt &&
                                                                  Array.isArray(
                                                                    fLt,
                                                                  ) &&
                                                                  fLt.length >
                                                                    0
                                                                ) {
                                                                  const strLt =
                                                                    track[sId]
                                                                      ?.lt ||
                                                                    "Trống";
                                                                  if (
                                                                    !fLt.includes(
                                                                      strLt,
                                                                    )
                                                                  )
                                                                    return false;
                                                                } else if (
                                                                  fLt &&
                                                                  typeof fLt ===
                                                                    "string"
                                                                ) {
                                                                  const strLt =
                                                                    track[sId]
                                                                      ?.lt ||
                                                                    "";
                                                                  if (
                                                                    !strLt
                                                                      .toLowerCase()
                                                                      .includes(
                                                                        fLt.toLowerCase(),
                                                                      )
                                                                  )
                                                                    return false;
                                                                }

                                                                const fTh =
                                                                  trackingFilters[
                                                                    `${sId}_th`
                                                                  ];
                                                                if (
                                                                  fTh &&
                                                                  Array.isArray(
                                                                    fTh,
                                                                  ) &&
                                                                  fTh.length >
                                                                    0
                                                                ) {
                                                                  const strTh =
                                                                    track[sId]
                                                                      ?.th ||
                                                                    "Trống";
                                                                  if (
                                                                    !fTh.includes(
                                                                      strTh,
                                                                    )
                                                                  )
                                                                    return false;
                                                                } else if (
                                                                  fTh &&
                                                                  typeof fTh ===
                                                                    "string"
                                                                ) {
                                                                  const strTh =
                                                                    track[sId]
                                                                      ?.th ||
                                                                    "";
                                                                  if (
                                                                    !strTh
                                                                      .toLowerCase()
                                                                      .includes(
                                                                        fTh.toLowerCase(),
                                                                      )
                                                                  )
                                                                    return false;
                                                                }

                                                                const fTimely =
                                                                  trackingFilters[
                                                                    `${sId}_timely`
                                                                  ];
                                                                if (
                                                                  fTimely &&
                                                                  Array.isArray(
                                                                    fTimely,
                                                                  ) &&
                                                                  fTimely.length >
                                                                    0
                                                                ) {
                                                                  const tVal =
                                                                    track[sId]
                                                                      ?.timely;
                                                                  const strVal =
                                                                    tVal ===
                                                                    true
                                                                      ? "✅"
                                                                      : tVal ===
                                                                          false
                                                                        ? "❌"
                                                                        : "Trống";
                                                                  if (
                                                                    !fTimely.includes(
                                                                      strVal,
                                                                    )
                                                                  )
                                                                    return false;
                                                                }
                                                              }

                                                              return true;
                                                            })
                                                            .sort((a, b) => {
                                                              const isNgungA = (
                                                                a.studyGroup ||
                                                                ""
                                                              )
                                                                .toLowerCase()
                                                                .includes(
                                                                  "ngừng",
                                                                );
                                                              const isNgungB = (
                                                                b.studyGroup ||
                                                                ""
                                                              )
                                                                .toLowerCase()
                                                                .includes(
                                                                  "ngừng",
                                                                );
                                                              if (
                                                                isNgungA &&
                                                                !isNgungB
                                                              )
                                                                return 1;
                                                              if (
                                                                !isNgungA &&
                                                                isNgungB
                                                              )
                                                                return -1;

                                                              const sgA =
                                                                a.studyGroup ||
                                                                "ZZZ";
                                                              const sgB =
                                                                b.studyGroup ||
                                                                "ZZZ";
                                                              if (sgA !== sgB)
                                                                return sgA.localeCompare(
                                                                  sgB,
                                                                );

                                                              const cA =
                                                                a.companion ||
                                                                "ZZZ";
                                                              const cB =
                                                                b.companion ||
                                                                "ZZZ";
                                                              if (cA !== cB)
                                                                return cA.localeCompare(
                                                                  cB,
                                                                );

                                                              const gA =
                                                                a.guideName ||
                                                                "ZZZ";
                                                              const gB =
                                                                b.guideName ||
                                                                "ZZZ";
                                                              if (gA !== gB)
                                                                return gA.localeCompare(
                                                                  gB,
                                                                );

                                                              return a.fullName.localeCompare(
                                                                b.fullName,
                                                              );
                                                            });
                                                          const activeCvsForSorted =
                                                            sorted.filter(
                                                              (cv) =>
                                                                !(
                                                                  cv.studyGroup ||
                                                                  ""
                                                                )
                                                                  .toLowerCase()
                                                                  .includes(
                                                                    "ngừng",
                                                                  ),
                                                            );
                                                          const ngungCvsForSorted =
                                                            sorted.filter(
                                                              (cv) =>
                                                                (
                                                                  cv.studyGroup ||
                                                                  ""
                                                                )
                                                                  .toLowerCase()
                                                                  .includes(
                                                                    "ngừng",
                                                                  ),
                                                            );

                                                          const renderRow = (
                                                            cv: any,
                                                            index: number,
                                                          ) => {
                                                            const track =
                                                              course.tracking?.[
                                                                cv.id
                                                              ] || {};
                                                            const updateTracking =
                                                              async (
                                                                lesson: string,
                                                                field:
                                                                  | "hoc"
                                                                  | "lt"
                                                                  | "th"
                                                                  | "timely"
                                                                  | "commitTime",
                                                                value: any,
                                                              ) => {
                                                                const currentTracking =
                                                                  course.tracking ||
                                                                  {};
                                                                pushToTrackingHistory(
                                                                  currentTracking,
                                                                );
                                                                const currentCvTracking =
                                                                  currentTracking[
                                                                    cv.id
                                                                  ] || {};
                                                                const newTracking =
                                                                  {
                                                                    ...currentTracking,
                                                                    [cv.id]: {
                                                                      ...currentCvTracking,
                                                                      [lesson]:
                                                                        {
                                                                          ...currentCvTracking[
                                                                            lesson
                                                                          ],
                                                                          [field]:
                                                                            value,
                                                                        },
                                                                    },
                                                                  };
                                                                await updateDoc(
                                                                  doc(
                                                                    db,
                                                                    "courses",
                                                                    course.id,
                                                                  ),
                                                                  {
                                                                    tracking:
                                                                      newTracking,
                                                                  },
                                                                );
                                                              };

                                                            return (
                                                              <tr
                                                                key={cv.id}
                                                                className="border-b border-[#E2E8F0] hover:bg-slate-50 text-center font-bold text-[10px]"
                                                              >
                                                                <td
                                                                  style={getColumnStyle(
                                                                    "stt",
                                                                  )}
                                                                  className={getColumnClass(
                                                                    "stt",
                                                                    "px-2 py-1 border-r border-[#E2E8F0] bg-[#E8F5E9]",
                                                                  )}
                                                                >
                                                                  {index + 1}
                                                                </td>
                                                                <td
                                                                  style={getColumnStyle(
                                                                    "companion",
                                                                  )}
                                                                  className={getColumnClass(
                                                                    "companion",
                                                                    "px-1 py-1 border-r border-[#E2E8F0] bg-[#E8F5E9] whitespace-normal",
                                                                  )}
                                                                >
                                                                  {isAdmin &&
                                                                  isEditingTracking ? (
                                                                    <select
                                                                      value={
                                                                        cv.companion ||
                                                                        ""
                                                                      }
                                                                      onChange={async (
                                                                        e,
                                                                      ) => {
                                                                        const val =
                                                                          e
                                                                            .target
                                                                            .value;
                                                                        try {
                                                                          await updateDoc(
                                                                            doc(
                                                                              db,
                                                                              "cvs",
                                                                              cv.id,
                                                                            ),
                                                                            {
                                                                              companion:
                                                                                val ||
                                                                                deleteField(),
                                                                            },
                                                                          );
                                                                        } catch (err) {
                                                                          console.error(
                                                                            err,
                                                                          );
                                                                        }
                                                                      }}
                                                                      className="w-full text-[10px] bg-transparent border-0 border-b border-transparent hover:border-slate-300 focus:border-green-500 rounded px-1 py-0.5 outline-none cursor-pointer"
                                                                    >
                                                                      <option value="">
                                                                        - Chọn -
                                                                      </option>
                                                                      {(
                                                                        course.companions ||
                                                                        []
                                                                      ).map(
                                                                        (c) => (
                                                                          <option
                                                                            key={
                                                                              c
                                                                            }
                                                                            value={
                                                                              c
                                                                            }
                                                                          >
                                                                            {c}
                                                                          </option>
                                                                        ),
                                                                      )}
                                                                    </select>
                                                                  ) : (
                                                                    cv.companion
                                                                  )}
                                                                </td>
                                                                <td
                                                                  style={getColumnStyle(
                                                                    "studentId",
                                                                  )}
                                                                  className={getColumnClass(
                                                                    "studentId",
                                                                    "px-1 py-1 border-r border-[#E2E8F0] bg-[#E8F5E9] text-purple-700",
                                                                  )}
                                                                >
                                                                  {isAdmin &&
                                                                  isEditingTracking ? (
                                                                    <input
                                                                      key={`student-id-${cv.id}-${cv.studentId || ""}`}
                                                                      type="text"
                                                                      className="w-full text-center text-[10px] font-bold text-purple-700 bg-transparent border-0 border-b border-transparent hover:border-slate-300 focus:border-purple-500 rounded px-1 py-0.5 outline-none"
                                                                      defaultValue={
                                                                        cv.studentId ||
                                                                        ""
                                                                      }
                                                                      onBlur={async (
                                                                        e,
                                                                      ) => {
                                                                        const val =
                                                                          e.target.value.trim();
                                                                        if (
                                                                          val !==
                                                                          (cv.studentId ||
                                                                            "")
                                                                        ) {
                                                                          try {
                                                                            await updateDoc(
                                                                              doc(
                                                                                db,
                                                                                "cvs",
                                                                                cv.id,
                                                                              ),
                                                                              {
                                                                                studentId:
                                                                                  val ||
                                                                                  deleteField(),
                                                                              },
                                                                            );
                                                                          } catch (err) {
                                                                            console.error(
                                                                              err,
                                                                            );
                                                                          }
                                                                        }
                                                                      }}
                                                                    />
                                                                  ) : (
                                                                    cv.studentId
                                                                  )}
                                                                </td>
                                                                <td
                                                                  style={getColumnStyle(
                                                                    "fullName",
                                                                  )}
                                                                  className={getColumnClass(
                                                                    "fullName",
                                                                    "px-2 py-1 border-r border-[#E2E8F0] bg-[#E3F2FD] whitespace-normal text-left",
                                                                  )}
                                                                >
                                                                  {cv.fullName}
                                                                </td>
                                                                <td
                                                                  style={getColumnStyle(
                                                                    "age",
                                                                  )}
                                                                  className={getColumnClass(
                                                                    "age",
                                                                    "px-2 py-1 border-r border-[#E2E8F0] bg-[#E3F2FD]",
                                                                  )}
                                                                >
                                                                  {cv.age}
                                                                </td>
                                                                <td
                                                                  style={getColumnStyle(
                                                                    "guideName",
                                                                  )}
                                                                  className={getColumnClass(
                                                                    "guideName",
                                                                    "px-2 py-1 border-r border-[#E2E8F0] bg-[#F3E5F5] text-left whitespace-nowrap",
                                                                  )}
                                                                >
                                                                  {cv.guideName}
                                                                </td>
                                                                <td
                                                                  style={getColumnStyle(
                                                                    "studyGroup",
                                                                  )}
                                                                  className={getColumnClass(
                                                                    "studyGroup",
                                                                    "px-1 py-1 border-r border-[#E2E8F0] bg-[#F3E5F5]",
                                                                  )}
                                                                >
                                                                  {isAdmin &&
                                                                  isEditingTracking ? (
                                                                    <select
                                                                      value={
                                                                        cv.studyGroup ||
                                                                        ""
                                                                      }
                                                                      onChange={async (
                                                                        e,
                                                                      ) => {
                                                                        const val =
                                                                          e
                                                                            .target
                                                                            .value;
                                                                        try {
                                                                          await updateDoc(
                                                                            doc(
                                                                              db,
                                                                              "cvs",
                                                                              cv.id,
                                                                            ),
                                                                            {
                                                                              studyGroup:
                                                                                val ||
                                                                                deleteField(),
                                                                            },
                                                                          );
                                                                        } catch (err) {
                                                                          console.error(
                                                                            err,
                                                                          );
                                                                        }
                                                                      }}
                                                                      className="w-full text-[10px] bg-transparent border-0 border-b border-transparent hover:border-slate-300 focus:border-purple-500 rounded px-1 py-0.5 outline-none cursor-pointer"
                                                                    >
                                                                      <option value="">
                                                                        - Chọn -
                                                                      </option>
                                                                      {(
                                                                        course.studyGroups ||
                                                                        []
                                                                      ).map(
                                                                        (g) => (
                                                                          <option
                                                                            key={
                                                                              g
                                                                            }
                                                                            value={
                                                                              g
                                                                            }
                                                                          >
                                                                            {g}
                                                                          </option>
                                                                        ),
                                                                      )}
                                                                    </select>
                                                                  ) : (
                                                                    cv.studyGroup
                                                                  )}
                                                                </td>
                                                                <td
                                                                  style={getColumnStyle(
                                                                    "fbLink",
                                                                  )}
                                                                  className={getColumnClass(
                                                                    "fbLink",
                                                                    "px-2 py-1 border-r border-[#E2E8F0] bg-[#F3E5F5] whitespace-normal",
                                                                  )}
                                                                >
                                                                  {cv.facebookLink ? (
                                                                    <a
                                                                      href={
                                                                        cv.facebookLink
                                                                      }
                                                                      target="_blank"
                                                                      rel="noopener noreferrer"
                                                                      className="text-blue-600 hover:underline"
                                                                    >
                                                                      Link
                                                                    </a>
                                                                  ) : (
                                                                    ""
                                                                  )}
                                                                </td>
                                                                {[
                                                                  {
                                                                    id: "buoiDinhHinh",
                                                                  },
                                                                  {
                                                                    id: "buoi1",
                                                                  },
                                                                  {
                                                                    id: "buoi2",
                                                                  },
                                                                  {
                                                                    id: "buoi3",
                                                                  },
                                                                  {
                                                                    id: "buoi4",
                                                                  },
                                                                  {
                                                                    id: "buoi5",
                                                                  },
                                                                  {
                                                                    id: "buoi6",
                                                                  },
                                                                ].map((b) => (
                                                                  <React.Fragment
                                                                    key={b.id}
                                                                  >
                                                                    <td className="px-1 py-1 border-r border-[#E2E8F0] bg-[#FFF8E1]">
                                                                      {isAdmin &&
                                                                      isEditingTracking ? (
                                                                        <button
                                                                          onClick={() =>
                                                                            updateTracking(
                                                                              b.id,
                                                                              "hoc",
                                                                              trackingStampHoc,
                                                                            )
                                                                          }
                                                                          className="text-sm w-full h-full min-h-[24px] flex justify-center items-center rounded hover:bg-[#FFE082]"
                                                                        >
                                                                          {track[
                                                                            b.id
                                                                          ]
                                                                            ?.hoc ===
                                                                          true
                                                                            ? "✅"
                                                                            : track[
                                                                                  b
                                                                                    .id
                                                                                ]
                                                                                  ?.hoc ===
                                                                                false
                                                                              ? "❌"
                                                                              : ""}
                                                                        </button>
                                                                      ) : (
                                                                        <div className="text-sm w-full h-full flex justify-center items-center py-1">
                                                                          {track[
                                                                            b.id
                                                                          ]
                                                                            ?.hoc ===
                                                                          true
                                                                            ? "✅"
                                                                            : track[
                                                                                  b
                                                                                    .id
                                                                                ]
                                                                                  ?.hoc ===
                                                                                false
                                                                              ? "❌"
                                                                              : ""}
                                                                        </div>
                                                                      )}
                                                                    </td>
                                                                    <td className="px-1 py-1 border-r border-[#E2E8F0] bg-[#FFF8E1]">
                                                                      {isAdmin &&
                                                                      isEditingTracking ? (
                                                                        <button
                                                                          onClick={() =>
                                                                            updateTracking(
                                                                              b.id,
                                                                              "lt",
                                                                              trackingStampHanh,
                                                                            )
                                                                          }
                                                                          className="text-sm w-full h-full min-h-[24px] flex justify-center items-center rounded hover:bg-[#FFE082]"
                                                                        >
                                                                          {track[
                                                                            b.id
                                                                          ]
                                                                            ?.lt ||
                                                                            ""}
                                                                        </button>
                                                                      ) : (
                                                                        <div className="text-sm w-full h-full flex justify-center items-center py-1">
                                                                          {track[
                                                                            b.id
                                                                          ]
                                                                            ?.lt ||
                                                                            ""}
                                                                        </div>
                                                                      )}
                                                                    </td>
                                                                    <td className="px-1 py-1 border-r border-[#E2E8F0] bg-[#FFF8E1]">
                                                                      {isAdmin &&
                                                                      isEditingTracking ? (
                                                                        <button
                                                                          onClick={() =>
                                                                            updateTracking(
                                                                              b.id,
                                                                              "th",
                                                                              trackingStampHanh,
                                                                            )
                                                                          }
                                                                          className="text-sm w-full h-full min-h-[24px] flex justify-center items-center rounded hover:bg-[#FFE082]"
                                                                        >
                                                                          {track[
                                                                            b.id
                                                                          ]
                                                                            ?.th ||
                                                                            ""}
                                                                        </button>
                                                                      ) : (
                                                                        <div className="text-sm w-full h-full flex justify-center items-center py-1">
                                                                          {track[
                                                                            b.id
                                                                          ]
                                                                            ?.th ||
                                                                            ""}
                                                                        </div>
                                                                      )}
                                                                    </td>
                                                                      <td className="px-1 py-1 border-r border-[#E2E8F0] bg-[#FFF8E1]">
                                                                        {isAdmin &&
                                                                        isEditingTracking ? (
                                                                          <button
                                                                            onClick={() =>
                                                                              updateTracking(
                                                                                b.id,
                                                                                "timely",
                                                                                trackingStampHanh,
                                                                              )
                                                                            }
                                                                            className="text-sm w-full h-full min-h-[24px] flex justify-center items-center rounded hover:bg-[#FFE082]"
                                                                          >
                                                                            {track[b.id]?.timely || ""}
                                                                          </button>
                                                                        ) : (
                                                                          <div className="text-sm w-full h-full flex justify-center items-center py-1">
                                                                            {track[b.id]?.timely || ""}
                                                                          </div>
                                                                        )}
                                                                      </td>
                                                                  </React.Fragment>
                                                                ))}
                                                                {isAdmin &&
                                                                  isEditingTracking && (
                                                                    <td className="px-1 py-1 border-r border-[#E2E8F0] bg-red-50 text-center">
                                                                      <button
                                                                        title="Xóa khỏi khóa học"
                                                                        onClick={async () => {
                                                                          if (
                                                                            await customConfirm(
                                                                              `Đưa CV học viên này khỏi khóa học?`,
                                                                            )
                                                                          ) {
                                                                            try {
                                                                              await updateDoc(
                                                                                doc(
                                                                                  db,
                                                                                  "courses",
                                                                                  course.id,
                                                                                ),
                                                                                {
                                                                                  studentIds:
                                                                                    arrayRemove(
                                                                                      cv.id,
                                                                                    ),
                                                                                },
                                                                              );
                                                                            } catch (err) {
                                                                              console.error(
                                                                                err,
                                                                              );
                                                                              setChromeAlert(
                                                                                "Lỗi khi xóa!",
                                                                              );
                                                                            }
                                                                          }
                                                                        }}
                                                                        className="text-red-500 hover:text-red-700 hover:bg-red-200 p-1 rounded transition-colors"
                                                                      >
                                                                        <Trash2
                                                                          size={
                                                                            12
                                                                          }
                                                                        />
                                                                      </button>
                                                                    </td>
                                                                  )}
                                                              </tr>
                                                            );
                                                          };

                                                          const activeMappedRows =
                                                            activeCvsForSorted.map(
                                                              (cv, index) =>
                                                                renderRow(
                                                                  cv,
                                                                  index,
                                                                ),
                                                            );
                                                          const ngungMappedRows =
                                                            ngungCvsForSorted.map(
                                                              (cv, index) =>
                                                                renderRow(
                                                                  cv,
                                                                  activeCvsForSorted.length +
                                                                    index,
                                                                ),
                                                            );

                                                          return (
                                                            <>
                                                              {activeMappedRows}
                                                              <tr className="border-b border-t border-[#E2E8F0] font-black text-slate-800 text-[11px] bg-[#E2E8F0]">
                                                                {columnsDef.map(
                                                                  (col) => {
                                                                    const isFullName =
                                                                      col.id ===
                                                                      "fullName";
                                                                    return (
                                                                      <td
                                                                        key={`total-${col.id}`}
                                                                        style={getColumnStyle(
                                                                          col.id,
                                                                        )}
                                                                        className={getColumnClass(
                                                                          col.id,
                                                                          "px-2 py-2 border-r border-[#E2E8F0] text-right uppercase bg-[#E2E8F0]",
                                                                        )}
                                                                      >
                                                                        {isFullName
                                                                          ? "TỔNG"
                                                                          : ""}
                                                                      </td>
                                                                    );
                                                                  },
                                                                )}
                                                                {[
                                                                  {
                                                                    id: "buoiDinhHinh",
                                                                  },
                                                                  {
                                                                    id: "buoi1",
                                                                  },
                                                                  {
                                                                    id: "buoi2",
                                                                  },
                                                                  {
                                                                    id: "buoi3",
                                                                  },
                                                                  {
                                                                    id: "buoi4",
                                                                  },
                                                                  {
                                                                    id: "buoi5",
                                                                  },
                                                                  {
                                                                    id: "buoi6",
                                                                  },
                                                                ].map((b) => {
                                                                  const nonNgungCvs =
                                                                    sorted.filter(
                                                                      (cv) =>
                                                                        !(
                                                                          cv.studyGroup ||
                                                                          ""
                                                                        )
                                                                          .toLowerCase()
                                                                          .includes(
                                                                            "ngừng",
                                                                          ),
                                                                    );
                                                                  const hocCount =
                                                                    nonNgungCvs.filter(
                                                                      (cv) =>
                                                                        course
                                                                          .tracking?.[
                                                                          cv.id
                                                                        ]?.[
                                                                          b.id
                                                                        ]
                                                                          ?.hoc ===
                                                                        true,
                                                                    ).length;
                                                                  const ltCount =
                                                                    nonNgungCvs.filter(
                                                                      (cv) =>
                                                                        course
                                                                          .tracking?.[
                                                                          cv.id
                                                                        ]?.[
                                                                          b.id
                                                                        ]
                                                                          ?.lt &&
                                                                        course
                                                                          .tracking?.[
                                                                          cv.id
                                                                        ]?.[
                                                                          b.id
                                                                        ]
                                                                          ?.lt !==
                                                                          "🖤",
                                                                    ).length;
                                                                  const thCount =
                                                                    nonNgungCvs.filter(
                                                                      (cv) =>
                                                                        course
                                                                          .tracking?.[
                                                                          cv.id
                                                                        ]?.[
                                                                          b.id
                                                                        ]
                                                                          ?.th &&
                                                                        course
                                                                          .tracking?.[
                                                                          cv.id
                                                                        ]?.[
                                                                          b.id
                                                                        ]
                                                                          ?.th !==
                                                                          "🖤",
                                                                    ).length;
                                                                  const timelyCount =
                                                                    nonNgungCvs.filter(
                                                                      (cv) =>
                                                                        course
                                                                          .tracking?.[
                                                                          cv.id
                                                                        ]?.[
                                                                          b.id
                                                                        ]
                                                                          ?.timely &&
                                                                        course
                                                                          .tracking?.[
                                                                          cv.id
                                                                        ]?.[
                                                                          b.id
                                                                        ]
                                                                          ?.timely !==
                                                                          "🖤",
                                                                    ).length;
                                                                  return (
                                                                    <React.Fragment
                                                                      key={`total-${b.id}`}
                                                                    >
                                                                      <td
                                                                        className="relative px-1 py-1 border-r border-[#E2E8F0] text-center bg-[#E2E8F0] text-green-700 cursor-pointer hover:bg-slate-200"
                                                                        onClick={(
                                                                          e,
                                                                        ) => {
                                                                          e.stopPropagation();
                                                                          setActiveTotalMenu(
                                                                            activeTotalMenu?.lessonId ===
                                                                              b.id &&
                                                                              activeTotalMenu?.type ===
                                                                                "hoc"
                                                                              ? null
                                                                              : {
                                                                                  lessonId:
                                                                                    b.id,
                                                                                  type: "hoc",
                                                                                },
                                                                          );
                                                                        }}
                                                                      >
                                                                        {
                                                                          hocCount
                                                                        }
                                                                        {activeTotalMenu?.lessonId ===
                                                                          b.id &&
                                                                          activeTotalMenu?.type ===
                                                                            "hoc" && (
                                                                            <div
                                                                              className="absolute z-50 bg-white border border-slate-200 rounded-lg shadow-xl p-3 left-1/2 -translate-x-1/2 bottom-full mb-1 text-[11px] text-slate-800 whitespace-nowrap min-w-[100px]"
                                                                              onClick={(
                                                                                e,
                                                                              ) =>
                                                                                e.stopPropagation()
                                                                              }
                                                                            >
                                                                              <div className="flex justify-between gap-4 py-1.5 border-b border-slate-100 items-center">
                                                                                <span className="flex items-center gap-1.5">
                                                                                  <span className="text-sm">
                                                                                    ✅
                                                                                  </span>{" "}
                                                                                  Đã
                                                                                  học
                                                                                </span>
                                                                                <span className="font-black text-green-700">
                                                                                  {
                                                                                    hocCount
                                                                                  }
                                                                                </span>
                                                                              </div>
                                                                              <div className="flex justify-between gap-4 py-1.5 items-center">
                                                                                <span className="flex items-center gap-1.5">
                                                                                  <span className="text-sm">
                                                                                    ❌
                                                                                  </span>{" "}
                                                                                  Chưa
                                                                                  học
                                                                                </span>
                                                                                <span className="font-black text-red-600">
                                                                                  {nonNgungCvs.length -
                                                                                    hocCount}
                                                                                </span>
                                                                              </div>
                                                                            </div>
                                                                          )}
                                                                      </td>
                                                                      <td className="px-1 py-1 border-r border-[#E2E8F0] text-center bg-[#E2E8F0] text-blue-700">
                                                                        {ltCount}
                                                                      </td>
                                                                      <td className="px-1 py-1 border-r border-[#E2E8F0] text-center bg-[#E2E8F0] text-purple-700">
                                                                        {thCount}
                                                                      </td>
                                                                      <td className="px-1 py-1 border-r border-[#E2E8F0] text-center bg-[#E2E8F0] text-slate-600">
                                                                        {
                                                                          timelyCount
                                                                        }
                                                                      </td>
                                                                    </React.Fragment>
                                                                  );
                                                                })}
                                                                {isAdmin &&
                                                                  isEditingTracking && (
                                                                    <td className="bg-[#E2E8F0]"></td>
                                                                  )}
                                                              </tr>
                                                              <tr className="border-b border-[#E2E8F0] font-bold text-slate-700 text-[11px] bg-slate-100">
                                                                {columnsDef.map(
                                                                  (col) => {
                                                                    const isFullName =
                                                                      col.id ===
                                                                      "fullName";
                                                                    return (
                                                                      <td
                                                                        key={`ngung-${col.id}`}
                                                                        style={getColumnStyle(
                                                                          col.id,
                                                                        )}
                                                                        className={getColumnClass(
                                                                          col.id,
                                                                          "px-2 py-2 border-r border-[#E2E8F0] text-right uppercase bg-slate-100",
                                                                        )}
                                                                      >
                                                                        {isFullName
                                                                          ? "NGỪNG/HỌC LẠI"
                                                                          : ""}
                                                                      </td>
                                                                    );
                                                                  },
                                                                )}
                                                                {[
                                                                  {
                                                                    id: "buoiDinhHinh",
                                                                  },
                                                                  {
                                                                    id: "buoi1",
                                                                  },
                                                                  {
                                                                    id: "buoi2",
                                                                  },
                                                                  {
                                                                    id: "buoi3",
                                                                  },
                                                                  {
                                                                    id: "buoi4",
                                                                  },
                                                                  {
                                                                    id: "buoi5",
                                                                  },
                                                                  {
                                                                    id: "buoi6",
                                                                  },
                                                                ].map((b) => {
                                                                  return (
                                                                    <React.Fragment
                                                                      key={`ngung-${b.id}`}
                                                                    >
                                                                      <td
                                                                        colSpan={
                                                                          3
                                                                        }
                                                                        className="px-1 py-1 border-r border-[#E2E8F0] text-center font-normal bg-slate-100"
                                                                      >
                                                                        {isAdmin &&
                                                                        isEditingTracking ? (
                                                                          <input
                                                                            type="text"
                                                                            defaultValue={
                                                                              course
                                                                                .tracking
                                                                                ?.summaryNgung?.[
                                                                                b
                                                                                  .id
                                                                              ] ||
                                                                              ""
                                                                            }
                                                                            onBlur={async (
                                                                              e,
                                                                            ) => {
                                                                              const val =
                                                                                e.target.value.trim();
                                                                              if (
                                                                                val !==
                                                                                (course
                                                                                  .tracking
                                                                                  ?.summaryNgung?.[
                                                                                  b
                                                                                    .id
                                                                                ] ||
                                                                                  "")
                                                                              ) {
                                                                                const currentTracking =
                                                                                  course.tracking ||
                                                                                  {};
                                                                                pushToTrackingHistory(
                                                                                  currentTracking,
                                                                                );
                                                                                const summaryNgung =
                                                                                  currentTracking.summaryNgung ||
                                                                                  {};
                                                                                const newTracking =
                                                                                  {
                                                                                    ...currentTracking,
                                                                                    summaryNgung:
                                                                                      {
                                                                                        ...summaryNgung,
                                                                                        [b.id]:
                                                                                          val,
                                                                                      },
                                                                                  };
                                                                                try {
                                                                                  await updateDoc(
                                                                                    doc(
                                                                                      db,
                                                                                      "courses",
                                                                                      course.id,
                                                                                    ),
                                                                                    {
                                                                                      tracking:
                                                                                        newTracking,
                                                                                    },
                                                                                  );
                                                                                } catch (err) {
                                                                                  console.error(
                                                                                    err,
                                                                                  );
                                                                                }
                                                                              }
                                                                            }}
                                                                            placeholder="0"
                                                                            className="w-full text-center text-[10px] bg-transparent border-0 border-b border-transparent hover:border-slate-300 focus:border-purple-500 rounded px-1 py-0.5 outline-none font-bold text-slate-700"
                                                                          />
                                                                        ) : (
                                                                          <span className="font-bold text-slate-700">
                                                                            {course
                                                                              .tracking
                                                                              ?.summaryNgung?.[
                                                                              b
                                                                                .id
                                                                            ] ||
                                                                              ""}
                                                                          </span>
                                                                        )}
                                                                      </td>
                                                                    </React.Fragment>
                                                                  );
                                                                })}
                                                                {isAdmin &&
                                                                  isEditingTracking && (
                                                                    <td className="bg-slate-100"></td>
                                                                  )}
                                                              </tr>
                                                              {ngungMappedRows}
                                                            </>
                                                          );
                                                        })()}
                                                      </tbody>
                                                    </table>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          } else {
                                            return (
                                              <>
                                                {/* Management Section */}
                                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col gap-3">
                                                  <h4 className="font-bold text-slate-800 text-sm">
                                                    {courseDetailTab ===
                                                    "companion"
                                                      ? "Danh sách Người đồng hành"
                                                      : "Danh sách Group học tập"}
                                                  </h4>
                                                  <div className="flex gap-2">
                                                    <input
                                                      type="text"
                                                      placeholder={
                                                        courseDetailTab ===
                                                        "companion"
                                                          ? "Tên người đồng hành mới..."
                                                          : "Tên Group học tập mới..."
                                                      }
                                                      value={newEntityName}
                                                      onChange={(e) =>
                                                        setNewEntityName(
                                                          e.target.value,
                                                        )
                                                      }
                                                      className="flex-1 w-full border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-100"
                                                    />
                                                    <button
                                                      onClick={async () => {
                                                        if (
                                                          !newEntityName.trim()
                                                        )
                                                          return;
                                                        const field =
                                                          courseDetailTab ===
                                                          "companion"
                                                            ? "companions"
                                                            : "studyGroups";
                                                        const currentList =
                                                          course[field] || [];
                                                        if (
                                                          !currentList.includes(
                                                            newEntityName.trim(),
                                                          )
                                                        ) {
                                                          await updateDoc(
                                                            doc(
                                                              db,
                                                              "courses",
                                                              course.id,
                                                            ),
                                                            {
                                                              [field]: [
                                                                ...currentList,
                                                                newEntityName.trim(),
                                                              ],
                                                            },
                                                          );
                                                          setNewEntityName("");
                                                        } else {
                                                          setChromeAlert(
                                                            "Tên này đã tồn tại!",
                                                          );
                                                        }
                                                      }}
                                                      className="px-6 py-2 bg-purple-600 shrink-0 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-purple-700 transition-colors shadow-md shadow-purple-200"
                                                    >
                                                      Tạo mới
                                                    </button>
                                                  </div>

                                                  {/* Tags of created entities */}
                                                  <div className="flex flex-wrap gap-2 mt-2">
                                                    {(courseDetailTab ===
                                                    "companion"
                                                      ? course.companions || []
                                                      : course.studyGroups || []
                                                    ).map((item) => {
                                                      const assignCount =
                                                        courseDetailTab ===
                                                        "companion"
                                                          ? searchedCvs.filter(
                                                              (c) =>
                                                                c.companion ===
                                                                item,
                                                            ).length
                                                          : searchedCvs.filter(
                                                              (c) =>
                                                                c.studyGroup ===
                                                                item,
                                                            ).length;
                                                      return (
                                                        <div
                                                          key={item}
                                                          className={cn(
                                                            "flex items-center gap-1.5 px-3 py-1 bg-white border rounded-lg text-xs font-bold shadow-sm",
                                                            getColorForString(
                                                              item,
                                                            ),
                                                          )}
                                                        >
                                                          {item}{" "}
                                                          <span className="opacity-75">
                                                            ({assignCount})
                                                          </span>
                                                          <button
                                                            onClick={async () => {
                                                              if (
                                                                await customConfirm(
                                                                  `Xóa ${item} khỏi danh sách?`,
                                                                )
                                                              ) {
                                                                const field =
                                                                  courseDetailTab ===
                                                                  "companion"
                                                                    ? "companions"
                                                                    : "studyGroups";
                                                                const cvField =
                                                                  courseDetailTab ===
                                                                  "companion"
                                                                    ? "companion"
                                                                    : "studyGroup";
                                                                const currentList =
                                                                  course[
                                                                    field
                                                                  ] || [];
                                                                await updateDoc(
                                                                  doc(
                                                                    db,
                                                                    "courses",
                                                                    course.id,
                                                                  ),
                                                                  {
                                                                    [field]:
                                                                      currentList.filter(
                                                                        (i) =>
                                                                          i !==
                                                                          item,
                                                                      ),
                                                                  },
                                                                );

                                                                // Also clear from all assigned CVs
                                                                const cvsToClear =
                                                                  searchedCvs.filter(
                                                                    (cv) =>
                                                                      cv[
                                                                        cvField
                                                                      ] ===
                                                                      item,
                                                                  );
                                                                await Promise.all(
                                                                  cvsToClear.map(
                                                                    (cv) =>
                                                                      updateDoc(
                                                                        doc(
                                                                          db,
                                                                          "cvs",
                                                                          cv.id,
                                                                        ),
                                                                        {
                                                                          [cvField]:
                                                                            "",
                                                                        },
                                                                      ),
                                                                  ),
                                                                );
                                                                setChromeAlert(
                                                                  `Đã xóa ${item} và gỡ phân bổ các CV liên quan!`,
                                                                );
                                                              }
                                                            }}
                                                            className="text-slate-400 hover:text-red-500 transition-colors text-lg leading-none"
                                                          >
                                                            &times;
                                                          </button>
                                                        </div>
                                                      );
                                                    })}
                                                    {(courseDetailTab ===
                                                    "companion"
                                                      ? course.companions || []
                                                      : course.studyGroups || []
                                                    ).length === 0 && (
                                                      <span className="text-xs text-slate-400">
                                                        Chưa có dữ liệu. Hãy tạo
                                                        mới ở trên.
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>

                                                {courseDetailTab === "companion"
                                                  ? (() => {
                                                      const filteredCvs =
                                                        searchedCvs.filter(
                                                          (cv) => {
                                                            if (
                                                              assignFilter ===
                                                              "all"
                                                            )
                                                              return true;
                                                            if (
                                                              assignFilter ===
                                                              "unassigned"
                                                            )
                                                              return !cv.companion;
                                                            return (
                                                              cv.companion ===
                                                              assignFilter
                                                            );
                                                          },
                                                        );

                                                      return (
                                                        <div className="space-y-4">
                                                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                                            <div className="flex items-center gap-3">
                                                              <input
                                                                type="checkbox"
                                                                className="w-5 h-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                                                checked={
                                                                  selectedStudentIdsForAssign.length ===
                                                                    filteredCvs.length &&
                                                                  filteredCvs.length >
                                                                    0
                                                                }
                                                                onChange={(
                                                                  e,
                                                                ) => {
                                                                  if (
                                                                    e.target
                                                                      .checked
                                                                  )
                                                                    setSelectedStudentIdsForAssign(
                                                                      filteredCvs.map(
                                                                        (c) =>
                                                                          c.id,
                                                                      ),
                                                                    );
                                                                  else
                                                                    setSelectedStudentIdsForAssign(
                                                                      [],
                                                                    );
                                                                }}
                                                              />
                                                              <span className="text-sm font-bold text-slate-700">
                                                                Chọn tất cả (
                                                                {
                                                                  selectedStudentIdsForAssign.length
                                                                }
                                                                /
                                                                {
                                                                  filteredCvs.length
                                                                }
                                                                )
                                                              </span>
                                                            </div>
                                                            <div className="flex flex-col md:flex-row gap-2 w-full lg:w-auto">
                                                              <select
                                                                value={
                                                                  assignFilter
                                                                }
                                                                onChange={(e) =>
                                                                  setAssignFilter(
                                                                    e.target
                                                                      .value,
                                                                  )
                                                                }
                                                                className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm font-bold text-blue-700 outline-none focus:border-blue-400"
                                                              >
                                                                <option value="all">
                                                                  Lọc: Tất cả CV
                                                                </option>
                                                                <option value="unassigned">
                                                                  Lọc: Chưa phân
                                                                  bổ
                                                                </option>
                                                                {(
                                                                  course.companions ||
                                                                  []
                                                                ).map((c) => (
                                                                  <option
                                                                    key={c}
                                                                    value={c}
                                                                  >
                                                                    Lọc: {c}
                                                                  </option>
                                                                ))}
                                                              </select>
                                                              <div className="w-px bg-slate-200 hidden md:block mx-1"></div>
                                                              <select
                                                                value={
                                                                  bulkAssignInput
                                                                }
                                                                onChange={(e) =>
                                                                  setBulkAssignInput(
                                                                    e.target
                                                                      .value,
                                                                  )
                                                                }
                                                                className="flex-1 min-w-[200px] border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-100"
                                                              >
                                                                <option value="">
                                                                  -- Chọn Người
                                                                  đồng hành --
                                                                </option>
                                                                <option value="CLEAR_ASSIGNMENT">
                                                                  -- Bỏ phân bổ
                                                                  (Xóa trắng) --
                                                                </option>
                                                                {(
                                                                  course.companions ||
                                                                  []
                                                                ).map((c) => (
                                                                  <option
                                                                    key={c}
                                                                    value={c}
                                                                  >
                                                                    {c}
                                                                  </option>
                                                                ))}
                                                              </select>
                                                              <button
                                                                onClick={async () => {
                                                                  if (
                                                                    !bulkAssignInput.trim() ||
                                                                    selectedStudentIdsForAssign.length ===
                                                                      0
                                                                  )
                                                                    return;
                                                                  try {
                                                                    const valueToSet =
                                                                      bulkAssignInput ===
                                                                      "CLEAR_ASSIGNMENT"
                                                                        ? deleteField()
                                                                        : bulkAssignInput.trim();
                                                                    await Promise.all(
                                                                      selectedStudentIdsForAssign.map(
                                                                        (id) =>
                                                                          updateDoc(
                                                                            doc(
                                                                              db,
                                                                              "cvs",
                                                                              id,
                                                                            ),
                                                                            {
                                                                              companion:
                                                                                valueToSet,
                                                                            },
                                                                          ),
                                                                      ),
                                                                    );
                                                                    setBulkAssignInput(
                                                                      "",
                                                                    );
                                                                    setSelectedStudentIdsForAssign(
                                                                      [],
                                                                    );
                                                                    setChromeAlert(
                                                                      "Đã cập nhật phân bổ thành công!",
                                                                    );
                                                                  } catch (e) {
                                                                    console.error(
                                                                      e,
                                                                    );
                                                                  }
                                                                }}
                                                                className="px-6 py-2 bg-purple-600 shrink-0 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-purple-700 transition-colors shadow-md shadow-purple-200"
                                                              >
                                                                Cập nhật
                                                              </button>
                                                            </div>
                                                          </div>

                                                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-2">
                                                            {filteredCvs
                                                              .sort((a, b) => {
                                                                const compA =
                                                                  a.companion ||
                                                                  "ZZZ";
                                                                const compB =
                                                                  b.companion ||
                                                                  "ZZZ";
                                                                if (
                                                                  compA !==
                                                                  compB
                                                                )
                                                                  return compA.localeCompare(
                                                                    compB,
                                                                  );
                                                                return a.fullName.localeCompare(
                                                                  b.fullName,
                                                                );
                                                              })
                                                              .map((cv) => (
                                                                <div
                                                                  key={cv.id}
                                                                  onClick={() => {
                                                                    setSelectedStudentIdsForAssign(
                                                                      (prev) =>
                                                                        prev.includes(
                                                                          cv.id,
                                                                        )
                                                                          ? prev.filter(
                                                                              (
                                                                                i,
                                                                              ) =>
                                                                                i !==
                                                                                cv.id,
                                                                            )
                                                                          : [
                                                                              ...prev,
                                                                              cv.id,
                                                                            ],
                                                                    );
                                                                  }}
                                                                  className={cn(
                                                                    "cursor-pointer border rounded-xl p-3 flex gap-3 transition-all relative group",
                                                                    selectedStudentIdsForAssign.includes(
                                                                      cv.id,
                                                                    )
                                                                      ? "border-purple-400 bg-purple-50 shadow-sm"
                                                                      : "border-slate-200 bg-white hover:bg-slate-50",
                                                                  )}
                                                                >
                                                                  <input
                                                                    type="checkbox"
                                                                    className="w-5 h-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 mt-0.5 pointer-events-none"
                                                                    checked={selectedStudentIdsForAssign.includes(
                                                                      cv.id,
                                                                    )}
                                                                    readOnly
                                                                  />
                                                                  <div className="flex-1 min-w-0">
                                                                    <p
                                                                      className="font-bold text-slate-800 text-sm mb-1 truncate"
                                                                      title={
                                                                        cv.fullName
                                                                      }
                                                                    >
                                                                      {
                                                                        cv.fullName
                                                                      }{" "}
                                                                      {cv.studentId && (
                                                                        <span className="text-purple-600 font-bold ml-1 text-xs px-1.5 py-0.5 bg-purple-100 rounded">
                                                                          (
                                                                          {
                                                                            cv.studentId
                                                                          }
                                                                          )
                                                                        </span>
                                                                      )}
                                                                      {cv.type ===
                                                                        "reenroll" && (
                                                                        <span className="ml-2 px-1.5 py-0.5 bg-yellow-100 text-amber-700 rounded text-[9px] font-black uppercase tracking-widest border border-yellow-200">
                                                                          Học
                                                                          lại (
                                                                          {
                                                                            cv.previousCourse
                                                                          }
                                                                          )
                                                                        </span>
                                                                      )}
                                                                    </p>
                                                                    <div className="flex flex-col gap-1 text-[10px] font-bold text-slate-500 mt-2 tracking-wide uppercase">
                                                                      <div className="flex justify-between items-center bg-slate-50 p-1.5 rounded">
                                                                        <span>
                                                                          <span className="text-slate-400">
                                                                            Tuổi:
                                                                          </span>{" "}
                                                                          {
                                                                            cv.age
                                                                          }
                                                                        </span>
                                                                        <span>
                                                                          <span className="text-slate-400">
                                                                            HDV:
                                                                          </span>{" "}
                                                                          {
                                                                            cv.guideName
                                                                          }
                                                                        </span>
                                                                      </div>
                                                                      <div className="flex justify-between items-center px-1">
                                                                        <span
                                                                          className={
                                                                            cv.companion
                                                                              ? cn(
                                                                                  "px-1.5 py-0.5 rounded border border-transparent font-black",
                                                                                  getColorForString(
                                                                                    cv.companion,
                                                                                  ),
                                                                                )
                                                                              : "text-slate-400"
                                                                          }
                                                                        >
                                                                          ĐH:{" "}
                                                                          {cv.companion ||
                                                                            "Chưa có"}
                                                                        </span>
                                                                        <span
                                                                          className={
                                                                            cv.studyGroup
                                                                              ? cn(
                                                                                  "px-1.5 py-0.5 rounded border border-transparent font-black",
                                                                                  getColorForString(
                                                                                    cv.studyGroup,
                                                                                  ),
                                                                                )
                                                                              : "text-slate-400"
                                                                          }
                                                                        >
                                                                          Group:{" "}
                                                                          {cv.studyGroup ||
                                                                            "Chưa có"}
                                                                        </span>
                                                                      </div>
                                                                    </div>
                                                                  </div>
                                                                  <button
                                                                    onClick={async (
                                                                      e,
                                                                    ) => {
                                                                      e.stopPropagation();
                                                                      if (
                                                                        !(await customConfirm(
                                                                          "Bạn có chắc chắn muốn xóa học viên này khỏi khóa học?",
                                                                        ))
                                                                      )
                                                                        return;

                                                                      const updatedTracking =
                                                                        course.tracking
                                                                          ? {
                                                                              ...course.tracking,
                                                                            }
                                                                          : {};
                                                                      delete updatedTracking[
                                                                        cv.id
                                                                      ];

                                                                      await updateDoc(
                                                                        doc(
                                                                          db,
                                                                          "courses",
                                                                          course.id,
                                                                        ),
                                                                        {
                                                                          studentIds:
                                                                            course.studentIds.filter(
                                                                              (
                                                                                id,
                                                                              ) =>
                                                                                id !==
                                                                                cv.id,
                                                                            ),
                                                                          removedStudentIds:
                                                                            [
                                                                              ...(course.removedStudentIds ||
                                                                                []),
                                                                              cv.id,
                                                                            ],
                                                                          tracking:
                                                                            updatedTracking,
                                                                        },
                                                                      );
                                                                      await updateDoc(
                                                                        doc(
                                                                          db,
                                                                          "cvs",
                                                                          cv.id,
                                                                        ),
                                                                        {
                                                                          companion:
                                                                            deleteField(),
                                                                          studyGroup:
                                                                            deleteField(),
                                                                          studentId:
                                                                            deleteField(),
                                                                        },
                                                                      );
                                                                    }}
                                                                    className="absolute top-2 right-2 p-1.5 bg-red-50 text-red-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 shadow-sm"
                                                                    title="Xóa khỏi khóa học"
                                                                  >
                                                                    <Trash2
                                                                      size={14}
                                                                    />
                                                                  </button>

                                                                  <button
                                                                    onClick={async (
                                                                      e,
                                                                    ) => {
                                                                      e.stopPropagation();
                                                                      if (
                                                                        !(await customConfirm(
                                                                          "Điều chuyển chuyển HV này về Danh sách chờ học lại (xóa khỏi khóa học hiện tại)?",
                                                                        ))
                                                                      )
                                                                        return;

                                                                      const updatedTracking =
                                                                        course.tracking
                                                                          ? {
                                                                              ...course.tracking,
                                                                            }
                                                                          : {};
                                                                      delete updatedTracking[
                                                                        cv.id
                                                                      ];

                                                                      await updateDoc(
                                                                        doc(
                                                                          db,
                                                                          "courses",
                                                                          course.id,
                                                                        ),
                                                                        {
                                                                          studentIds:
                                                                            course.studentIds.filter(
                                                                              (
                                                                                id,
                                                                              ) =>
                                                                                id !==
                                                                                cv.id,
                                                                            ),
                                                                          tracking:
                                                                            updatedTracking,
                                                                        },
                                                                      );

                                                                      await updateDoc(
                                                                        doc(
                                                                          db,
                                                                          "cvs",
                                                                          cv.id,
                                                                        ),
                                                                        {
                                                                          type: "reenroll",
                                                                          previousCourse:
                                                                            course.name,
                                                                          companion:
                                                                            deleteField(),
                                                                          studyGroup:
                                                                            deleteField(),
                                                                          studentId:
                                                                            deleteField(),
                                                                        },
                                                                      );
                                                                      setChromeAlert(
                                                                        "Đã chuyển về Danh sách chờ học lại!",
                                                                      );
                                                                    }}
                                                                    className="absolute top-2 right-9 p-1.5 bg-yellow-50 text-amber-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-yellow-100 shadow-sm"
                                                                    title="Điều chuyển về danh sách chờ học lại (loại khỏi khóa)"
                                                                  >
                                                                    <ArrowDownToLine
                                                                      size={14}
                                                                    />
                                                                  </button>
                                                                </div>
                                                              ))}
                                                          </div>
                                                        </div>
                                                      );
                                                    })()
                                                  : (() => {
                                                      const filteredCvs =
                                                        searchedCvs.filter(
                                                          (cv) => {
                                                            if (
                                                              assignFilter ===
                                                              "all"
                                                            )
                                                              return true;
                                                            if (
                                                              assignFilter ===
                                                              "unassigned"
                                                            )
                                                              return !cv.studyGroup;
                                                            return (
                                                              cv.studyGroup ===
                                                              assignFilter
                                                            );
                                                          },
                                                        );

                                                      return (
                                                        <div className="space-y-4">
                                                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                                            <div className="flex items-center gap-3">
                                                              <input
                                                                type="checkbox"
                                                                className="w-5 h-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                                                checked={
                                                                  selectedStudentIdsForAssign.length ===
                                                                    filteredCvs.length &&
                                                                  filteredCvs.length >
                                                                    0
                                                                }
                                                                onChange={(
                                                                  e,
                                                                ) => {
                                                                  if (
                                                                    e.target
                                                                      .checked
                                                                  )
                                                                    setSelectedStudentIdsForAssign(
                                                                      filteredCvs.map(
                                                                        (c) =>
                                                                          c.id,
                                                                      ),
                                                                    );
                                                                  else
                                                                    setSelectedStudentIdsForAssign(
                                                                      [],
                                                                    );
                                                                }}
                                                              />
                                                              <span className="text-sm font-bold text-slate-700">
                                                                Chọn tất cả (
                                                                {
                                                                  selectedStudentIdsForAssign.length
                                                                }
                                                                /
                                                                {
                                                                  filteredCvs.length
                                                                }
                                                                )
                                                              </span>
                                                            </div>
                                                            <div className="flex flex-col md:flex-row gap-2 w-full lg:w-auto">
                                                              <select
                                                                value={
                                                                  assignFilter
                                                                }
                                                                onChange={(e) =>
                                                                  setAssignFilter(
                                                                    e.target
                                                                      .value,
                                                                  )
                                                                }
                                                                className="border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm font-bold text-blue-700 outline-none focus:border-blue-400"
                                                              >
                                                                <option value="all">
                                                                  Lọc: Tất cả CV
                                                                </option>
                                                                <option value="unassigned">
                                                                  Lọc: Chưa phân
                                                                  bổ
                                                                </option>
                                                                {(
                                                                  course.studyGroups ||
                                                                  []
                                                                ).map((g) => (
                                                                  <option
                                                                    key={g}
                                                                    value={g}
                                                                  >
                                                                    Lọc: {g}
                                                                  </option>
                                                                ))}
                                                              </select>
                                                              <div className="w-px bg-slate-200 hidden md:block mx-1"></div>
                                                              <select
                                                                value={
                                                                  bulkAssignInput
                                                                }
                                                                onChange={(e) =>
                                                                  setBulkAssignInput(
                                                                    e.target
                                                                      .value,
                                                                  )
                                                                }
                                                                className="flex-1 min-w-[200px] border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-100"
                                                              >
                                                                <option value="">
                                                                  -- Chọn Group
                                                                  học tập --
                                                                </option>
                                                                <option value="CLEAR_ASSIGNMENT">
                                                                  -- Bỏ phân bổ
                                                                  (Xóa trắng) --
                                                                </option>
                                                                {(
                                                                  course.studyGroups ||
                                                                  []
                                                                ).map((g) => (
                                                                  <option
                                                                    key={g}
                                                                    value={g}
                                                                  >
                                                                    {g}
                                                                  </option>
                                                                ))}
                                                              </select>
                                                              <button
                                                                onClick={async () => {
                                                                  if (
                                                                    !bulkAssignInput.trim() ||
                                                                    selectedStudentIdsForAssign.length ===
                                                                      0
                                                                  )
                                                                    return;
                                                                  try {
                                                                    const valueToSet =
                                                                      bulkAssignInput ===
                                                                      "CLEAR_ASSIGNMENT"
                                                                        ? deleteField()
                                                                        : bulkAssignInput.trim();
                                                                    await Promise.all(
                                                                      selectedStudentIdsForAssign.map(
                                                                        (id) =>
                                                                          updateDoc(
                                                                            doc(
                                                                              db,
                                                                              "cvs",
                                                                              id,
                                                                            ),
                                                                            {
                                                                              studyGroup:
                                                                                valueToSet,
                                                                            },
                                                                          ),
                                                                      ),
                                                                    );
                                                                    setBulkAssignInput(
                                                                      "",
                                                                    );
                                                                    setSelectedStudentIdsForAssign(
                                                                      [],
                                                                    );
                                                                    setChromeAlert(
                                                                      "Đã cập nhật phân bổ thành công!",
                                                                    );
                                                                  } catch (e) {
                                                                    console.error(
                                                                      e,
                                                                    );
                                                                  }
                                                                }}
                                                                className="px-6 py-2 bg-purple-600 shrink-0 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-purple-700 transition-colors shadow-md shadow-purple-200"
                                                              >
                                                                Cập nhật
                                                              </button>
                                                            </div>
                                                          </div>

                                                          {/* Group by study group */}
                                                          <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
                                                            {(() => {
                                                              const byGroup =
                                                                filteredCvs.reduce(
                                                                  (acc, cv) => {
                                                                    const grp =
                                                                      cv.studyGroup ||
                                                                      "Chưa nhóm";
                                                                    if (
                                                                      !acc[grp]
                                                                    )
                                                                      acc[grp] =
                                                                        [];
                                                                    acc[
                                                                      grp
                                                                    ].push(cv);
                                                                    return acc;
                                                                  },
                                                                  {} as Record<
                                                                    string,
                                                                    CV[]
                                                                  >,
                                                                );

                                                              return (
                                                                Object.entries(
                                                                  byGroup,
                                                                ) as [
                                                                  string,
                                                                  CV[],
                                                                ][]
                                                              )
                                                                .sort((a, b) =>
                                                                  a[0].localeCompare(
                                                                    b[0],
                                                                  ),
                                                                )
                                                                .map(
                                                                  ([
                                                                    grp,
                                                                    cvs,
                                                                  ]) => {
                                                                    const checkedCount =
                                                                      cvs.filter(
                                                                        (c) =>
                                                                          selectedStudentIdsForAssign.includes(
                                                                            c.id,
                                                                          ),
                                                                      ).length;
                                                                    const allChecked =
                                                                      checkedCount ===
                                                                        cvs.length &&
                                                                      cvs.length >
                                                                        0;
                                                                    return (
                                                                      <div
                                                                        key={
                                                                          grp
                                                                        }
                                                                        className="space-y-3"
                                                                      >
                                                                        <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
                                                                          <input
                                                                            type="checkbox"
                                                                            className="w-5 h-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                                                            checked={
                                                                              allChecked
                                                                            }
                                                                            onChange={(
                                                                              e,
                                                                            ) => {
                                                                              if (
                                                                                e
                                                                                  .target
                                                                                  .checked
                                                                              )
                                                                                setSelectedStudentIdsForAssign(
                                                                                  (
                                                                                    prev,
                                                                                  ) =>
                                                                                    Array.from(
                                                                                      new Set(
                                                                                        [
                                                                                          ...prev,
                                                                                          ...cvs.map(
                                                                                            (
                                                                                              c,
                                                                                            ) =>
                                                                                              c.id,
                                                                                          ),
                                                                                        ],
                                                                                      ),
                                                                                    ),
                                                                                );
                                                                              else
                                                                                setSelectedStudentIdsForAssign(
                                                                                  (
                                                                                    prev,
                                                                                  ) =>
                                                                                    prev.filter(
                                                                                      (
                                                                                        id,
                                                                                      ) =>
                                                                                        !cvs.find(
                                                                                          (
                                                                                            c,
                                                                                          ) =>
                                                                                            c.id ===
                                                                                            id,
                                                                                        ),
                                                                                    ),
                                                                                );
                                                                            }}
                                                                          />
                                                                          <h4 className="font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                                                                            <span
                                                                              className={
                                                                                grp !==
                                                                                "Chưa nhóm"
                                                                                  ? cn(
                                                                                      "px-2 py-0.5 rounded",
                                                                                      getColorForString(
                                                                                        grp,
                                                                                      ),
                                                                                    )
                                                                                  : ""
                                                                              }
                                                                            >
                                                                              {
                                                                                grp
                                                                              }
                                                                            </span>
                                                                            <span className="text-slate-400 text-xs tracking-widest">
                                                                              (
                                                                              {
                                                                                cvs.length
                                                                              }
                                                                              )
                                                                            </span>
                                                                          </h4>
                                                                        </div>
                                                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pl-8">
                                                                          {cvs
                                                                            .sort(
                                                                              (
                                                                                a,
                                                                                b,
                                                                              ) =>
                                                                                a.fullName.localeCompare(
                                                                                  b.fullName,
                                                                                ),
                                                                            )
                                                                            .map(
                                                                              (
                                                                                cv,
                                                                              ) => (
                                                                                <div
                                                                                  key={
                                                                                    cv.id
                                                                                  }
                                                                                  onClick={() => {
                                                                                    setSelectedStudentIdsForAssign(
                                                                                      (
                                                                                        prev,
                                                                                      ) =>
                                                                                        prev.includes(
                                                                                          cv.id,
                                                                                        )
                                                                                          ? prev.filter(
                                                                                              (
                                                                                                i,
                                                                                              ) =>
                                                                                                i !==
                                                                                                cv.id,
                                                                                            )
                                                                                          : [
                                                                                              ...prev,
                                                                                              cv.id,
                                                                                            ],
                                                                                    );
                                                                                  }}
                                                                                  className={cn(
                                                                                    "cursor-pointer border rounded-xl p-3 flex gap-3 transition-colors relative group",
                                                                                    selectedStudentIdsForAssign.includes(
                                                                                      cv.id,
                                                                                    )
                                                                                      ? "border-purple-400 bg-purple-50 shadow-sm"
                                                                                      : "border-slate-200 bg-white hover:bg-slate-50",
                                                                                  )}
                                                                                >
                                                                                  <input
                                                                                    type="checkbox"
                                                                                    className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 mt-0.5 pointer-events-none"
                                                                                    checked={selectedStudentIdsForAssign.includes(
                                                                                      cv.id,
                                                                                    )}
                                                                                    readOnly
                                                                                  />
                                                                                  <div className="flex-1 min-w-0">
                                                                                    <p
                                                                                      className="font-bold text-slate-800 text-sm mb-1 truncate"
                                                                                      title={
                                                                                        cv.fullName
                                                                                      }
                                                                                    >
                                                                                      {
                                                                                        cv.fullName
                                                                                      }{" "}
                                                                                      {cv.studentId && (
                                                                                        <span className="text-purple-600 font-bold ml-1 text-xs px-1.5 py-0.5 bg-purple-100 rounded">
                                                                                          (
                                                                                          {
                                                                                            cv.studentId
                                                                                          }
                                                                                          )
                                                                                        </span>
                                                                                      )}
                                                                                      {cv.type ===
                                                                                        "reenroll" && (
                                                                                        <span className="ml-2 px-1.5 py-0.5 bg-yellow-100 text-amber-700 rounded text-[9px] font-black uppercase tracking-widest border border-yellow-200">
                                                                                          Học
                                                                                          lại
                                                                                          (
                                                                                          {
                                                                                            cv.previousCourse
                                                                                          }
                                                                                          )
                                                                                        </span>
                                                                                      )}
                                                                                    </p>
                                                                                    <div className="flex flex-col gap-1 text-[10px] font-bold text-slate-500 mt-2 tracking-wide uppercase">
                                                                                      <div className="flex justify-between items-center bg-slate-50 p-1.5 rounded">
                                                                                        <span>
                                                                                          <span className="text-slate-400">
                                                                                            Tuổi:
                                                                                          </span>{" "}
                                                                                          {
                                                                                            cv.age
                                                                                          }
                                                                                        </span>
                                                                                        <span>
                                                                                          <span className="text-slate-400">
                                                                                            HDV:
                                                                                          </span>{" "}
                                                                                          {
                                                                                            cv.guideName
                                                                                          }
                                                                                        </span>
                                                                                      </div>
                                                                                      <div className="flex justify-between items-center px-1">
                                                                                        <span
                                                                                          className={
                                                                                            cv.companion
                                                                                              ? cn(
                                                                                                  "px-1.5 py-0.5 rounded border border-transparent font-black",
                                                                                                  getColorForString(
                                                                                                    cv.companion,
                                                                                                  ),
                                                                                                )
                                                                                              : "text-slate-400"
                                                                                          }
                                                                                        >
                                                                                          ĐH:{" "}
                                                                                          {cv.companion ||
                                                                                            "Chưa có"}
                                                                                        </span>
                                                                                        <span
                                                                                          className={
                                                                                            cv.studyGroup
                                                                                              ? cn(
                                                                                                  "px-1.5 py-0.5 rounded border border-transparent font-black",
                                                                                                  getColorForString(
                                                                                                    cv.studyGroup,
                                                                                                  ),
                                                                                                )
                                                                                              : "text-slate-400"
                                                                                          }
                                                                                        >
                                                                                          Group:{" "}
                                                                                          {cv.studyGroup ||
                                                                                            "Chưa có"}
                                                                                        </span>
                                                                                      </div>
                                                                                    </div>
                                                                                  </div>
                                                                                  <button
                                                                                    onClick={async (
                                                                                      e,
                                                                                    ) => {
                                                                                      e.stopPropagation();
                                                                                      if (
                                                                                        !(await customConfirm(
                                                                                          "Bạn có chắc chắn muốn xóa học viên này khỏi khóa học?",
                                                                                        ))
                                                                                      )
                                                                                        return;

                                                                                      const updatedTracking =
                                                                                        course.tracking
                                                                                          ? {
                                                                                              ...course.tracking,
                                                                                            }
                                                                                          : {};
                                                                                      delete updatedTracking[
                                                                                        cv
                                                                                          .id
                                                                                      ];

                                                                                      await updateDoc(
                                                                                        doc(
                                                                                          db,
                                                                                          "courses",
                                                                                          course.id,
                                                                                        ),
                                                                                        {
                                                                                          studentIds:
                                                                                            course.studentIds.filter(
                                                                                              (
                                                                                                id,
                                                                                              ) =>
                                                                                                id !==
                                                                                                cv.id,
                                                                                            ),
                                                                                          removedStudentIds:
                                                                                            [
                                                                                              ...(course.removedStudentIds ||
                                                                                                []),
                                                                                              cv.id,
                                                                                            ],
                                                                                          tracking:
                                                                                            updatedTracking,
                                                                                        },
                                                                                      );
                                                                                      await updateDoc(
                                                                                        doc(
                                                                                          db,
                                                                                          "cvs",
                                                                                          cv.id,
                                                                                        ),
                                                                                        {
                                                                                          companion:
                                                                                            deleteField(),
                                                                                          studyGroup:
                                                                                            deleteField(),
                                                                                          studentId:
                                                                                            deleteField(),
                                                                                        },
                                                                                      );
                                                                                    }}
                                                                                    className="absolute top-2 right-2 p-1.5 bg-red-50 text-red-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 shadow-sm"
                                                                                    title="Xóa khỏi khóa học"
                                                                                  >
                                                                                    <Trash2
                                                                                      size={
                                                                                        14
                                                                                      }
                                                                                    />
                                                                                  </button>

                                                                                  <button
                                                                                    onClick={async (
                                                                                      e,
                                                                                    ) => {
                                                                                      e.stopPropagation();
                                                                                      if (
                                                                                        !(await customConfirm(
                                                                                          "Điều chuyển chuyển HV này về Danh sách chờ học lại (xóa khỏi khóa học hiện tại)?",
                                                                                        ))
                                                                                      )
                                                                                        return;

                                                                                      const updatedTracking =
                                                                                        course.tracking
                                                                                          ? {
                                                                                              ...course.tracking,
                                                                                            }
                                                                                          : {};
                                                                                      delete updatedTracking[
                                                                                        cv
                                                                                          .id
                                                                                      ];

                                                                                      await updateDoc(
                                                                                        doc(
                                                                                          db,
                                                                                          "courses",
                                                                                          course.id,
                                                                                        ),
                                                                                        {
                                                                                          studentIds:
                                                                                            course.studentIds.filter(
                                                                                              (
                                                                                                id,
                                                                                              ) =>
                                                                                                id !==
                                                                                                cv.id,
                                                                                            ),
                                                                                          tracking:
                                                                                            updatedTracking,
                                                                                        },
                                                                                      );

                                                                                      await updateDoc(
                                                                                        doc(
                                                                                          db,
                                                                                          "cvs",
                                                                                          cv.id,
                                                                                        ),
                                                                                        {
                                                                                          type: "reenroll",
                                                                                          previousCourse:
                                                                                            course.name,
                                                                                          companion:
                                                                                            deleteField(),
                                                                                          studyGroup:
                                                                                            deleteField(),
                                                                                          studentId:
                                                                                            deleteField(),
                                                                                        },
                                                                                      );
                                                                                      setChromeAlert(
                                                                                        "Đã chuyển về Danh sách chờ học lại!",
                                                                                      );
                                                                                    }}
                                                                                    className="absolute top-2 right-9 p-1.5 bg-yellow-50 text-amber-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-yellow-100 shadow-sm"
                                                                                    title="Điều chuyển về danh sách chờ học lại (loại khỏi khóa)"
                                                                                  >
                                                                                    <ArrowDownToLine
                                                                                      size={
                                                                                        14
                                                                                      }
                                                                                    />
                                                                                  </button>
                                                                                </div>
                                                                              ),
                                                                            )}
                                                                        </div>
                                                                      </div>
                                                                    );
                                                                  },
                                                                );
                                                            })()}
                                                          </div>
                                                        </div>
                                                      );
                                                    })()}
                                              </>
                                            );
                                          }
                                        })()}
                                      </div>
                                    </div>
                                  </div>
                                );
                              }

                              const displayedCvs = getFilteredCVs();

                              return (
                                <>
                                  {adminCvTab === "delete" &&
                                    displayedCvs.length > 0 && (
                                      <div className="flex items-center gap-3 px-6 py-3 bg-red-50 rounded-2xl border border-red-100 mb-2">
                                        <input
                                          type="checkbox"
                                          className="w-5 h-5 rounded border-red-300 text-red-600 focus:ring-red-500"
                                          checked={
                                            selectedDeleteCvIds.length ===
                                              displayedCvs.length &&
                                            selectedDeleteCvIds.length > 0
                                          }
                                          onChange={(e) => {
                                            if (e.target.checked)
                                              setSelectedDeleteCvIds(
                                                displayedCvs.map((c) => c.id),
                                              );
                                            else setSelectedDeleteCvIds([]);
                                          }}
                                        />
                                        <span className="text-xs font-black text-red-600 uppercase tracking-widest">
                                          Chọn tất cả {displayedCvs.length} CV
                                          (Hoàn thành/Từ chối) để xóa
                                        </span>
                                      </div>
                                    )}

                                  {adminCvTab === "app_approver" &&
                                    statusSubFilter === "processing" &&
                                    displayedCvs.length > 0 && (
                                      <div className="flex items-center gap-3 px-6 py-3 bg-slate-50 rounded-2xl border border-slate-100 mb-2">
                                        <input
                                          type="checkbox"
                                          className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                          checked={
                                            selectedAppCvIds.length ===
                                              displayedCvs.length &&
                                            selectedAppCvIds.length > 0
                                          }
                                          onChange={(e) => {
                                            if (e.target.checked)
                                              setSelectedAppCvIds(
                                                displayedCvs.map((c) => c.id),
                                              );
                                            else setSelectedAppCvIds([]);
                                          }}
                                        />
                                        <span className="text-xs font-black text-slate-600 uppercase tracking-widest">
                                          Chọn tất cả {displayedCvs.length} CV
                                          (Chưa duyệt/Từ chối)
                                        </span>
                                      </div>
                                    )}

                                  {displayedCvs.length === 0 ? (
                                    <div className="py-24 text-center bg-white rounded-[40px] border border-slate-100">
                                      <p className="text-slate-400 font-bold italic text-lg capitalize">
                                        Không có CV nào để hiển thị trong mục
                                        này
                                      </p>
                                    </div>
                                  ) : cvListViewMode === "by_date" ? (
                                    Object.entries(
                                      displayedCvs.reduce(
                                        (acc, cv) => {
                                          const dateStr = cv.createdAt
                                            ? format(
                                                cv.createdAt.toDate(),
                                                "dd/MM/yyyy",
                                              )
                                            : "Chưa rõ ràng";
                                          if (!acc[dateStr]) acc[dateStr] = [];
                                          acc[dateStr].push(cv);
                                          return acc;
                                        },
                                        {} as Record<string, CV[]>,
                                      ),
                                    ).map(([dateStr, cvsInDate]) => (
                                      <div key={dateStr} className="mb-8">
                                        <div className="flex items-center gap-2 mb-4 px-2">
                                          <h4 className="text-sm font-black text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                                            Ngày {dateStr}
                                          </h4>
                                          <span className="bg-white border border-slate-200 text-slate-600 text-xs font-bold px-2 py-1 rounded-full">
                                            {(cvsInDate as CV[]).length} CV
                                          </span>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4">
                                          {renderCVList(cvsInDate as CV[])}
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    (() => {
                                      const priorityCvs = displayedCvs.filter(
                                        (c) =>
                                          cvFilterMapping.pending(c) ||
                                          cvFilterMapping.processing(c),
                                      );
                                      const otherCvs = displayedCvs.filter(
                                        (c) =>
                                          !(
                                            cvFilterMapping.pending(c) ||
                                            cvFilterMapping.processing(c)
                                          ),
                                      );

                                      return (
                                        <div className="space-y-12">
                                          {priorityCvs.length > 0 && (
                                            <div>
                                              <div className="flex items-center gap-2 mb-4 px-2">
                                                <h4 className="text-sm font-black text-blue-700 bg-blue-100 px-3 py-1.5 rounded-xl border border-blue-200 shadow-sm">
                                                  Cần xử lý ngay
                                                </h4>
                                                <span className="bg-white border border-blue-200 text-blue-700 text-xs font-bold px-2 py-1 rounded-full shadow-sm">
                                                  {priorityCvs.length} CV
                                                </span>
                                              </div>
                                              <div className="grid grid-cols-1 gap-4">
                                                {renderCVList(priorityCvs)}
                                              </div>
                                            </div>
                                          )}
                                          {otherCvs.length > 0 && (
                                            <div>
                                              <div className="flex items-center gap-2 mb-4 px-2">
                                                <h4 className="text-sm font-black text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
                                                  Đã xử lý (Hoàn thành / Từ
                                                  chối)
                                                </h4>
                                                <span className="bg-white border border-slate-200 text-slate-600 text-xs font-bold px-2 py-1 rounded-full shadow-sm">
                                                  {otherCvs.length} CV
                                                </span>
                                              </div>
                                              <div className="grid grid-cols-1 gap-4">
                                                {renderCVList(otherCvs)}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </>
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
              onClick={() =>
                !isProcessingAction &&
                setCvActionModal({ ...cvActionModal, show: false })
              }
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
                    {cvActionModal.type === "approve"
                      ? "Phê duyệt"
                      : cvActionModal.type === "reject"
                        ? "Từ chối"
                        : cvActionModal.type === "bulkApproveApp" ||
                            cvActionModal.type === "approveApp"
                          ? "Duyệt App"
                          : cvActionModal.type === "bulkRejectApp"
                            ? "Từ chối Duyệt App"
                            : cvActionModal.type === "enableAppApprovalMode"
                              ? "Bật Duyệt App"
                              : cvActionModal.type === "enableDeleteCvMode"
                                ? "Bật Xóa CV"
                                : cvActionModal.type === "bulkDeleteCv"
                                  ? "Xác nhận xóa CV"
                                  : "Khôi phục"}
                  </h3>
                  <div className="p-2 bg-slate-50 text-slate-300 rounded-xl">
                    {cvActionModal.type === "bulkDeleteCv" ? (
                      <Trash2 size={20} />
                    ) : (
                      <LogIn size={20} />
                    )}
                  </div>
                </div>

                {cvActionModal.type === "bulkDeleteCv" ? (
                  <div className="space-y-6">
                    <p className="text-center text-slate-600 font-medium py-4">
                      Bạn muốn xác nhận xóa vĩnh viễn không?
                    </p>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() =>
                          setCvActionModal({
                            show: false,
                            cvId: "",
                            type: null,
                          })
                        }
                        className="flex-1 py-5 rounded-3xl font-black text-xs uppercase tracking-widest transition-all bg-slate-100 text-slate-500 hover:bg-slate-200"
                      >
                        NO
                      </button>
                      <button
                        onClick={confirmCVAction}
                        disabled={isProcessingAction}
                        className="flex-1 py-5 rounded-3xl font-black text-xs uppercase tracking-widest transition-all bg-red-600 text-white hover:bg-red-700 shadow-xl shadow-red-200 disabled:opacity-50"
                      >
                        {isProcessingAction ? "ĐANG XỬ LÝ..." : "YES"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-6">
                      {(cvActionModal.type === "bulkRejectApp" ||
                        cvActionModal.type === "reject") && (
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                            LÝ DO TỪ CHỐI
                          </label>
                          <textarea
                            placeholder="Nhập lý do chi tiết..."
                            value={appRejectReasonInput}
                            onChange={(e) =>
                              setAppRejectReasonInput(e.target.value)
                            }
                            className="w-full px-7 py-4 bg-slate-50 border border-transparent focus:border-slate-200 outline-none rounded-3xl font-medium text-sm text-slate-800 transition-all placeholder:text-slate-300 min-h-[100px] resize-none"
                          />
                        </div>
                      )}

                      {cvActionModal.type !== "bulkRejectApp" &&
                        cvActionModal.type !== "reject" &&
                        !isActionUnlocked() && (
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                              {(() => {
                                if (cvActionModal.type === "restore") {
                                  const cvToRestore = cvs.find(
                                    (c) => c.id === cvActionModal.cvId,
                                  );
                                  return cvToRestore?.appRejectedReason
                                    ? "MẬT KHẨU DUYỆT APP"
                                    : "MẬT KHẨU KẾ TOÁN";
                                }
                                if (cvActionModal.type === "approve")
                                  return "MẬT KHẨU KẾ TOÁN";
                                if (cvActionModal.type === "bulkApproveApp")
                                  return "MẬT KHẨU DUYỆT APP";
                                if (cvActionModal.type === "bulkDeleteCv")
                                  return "MẬT KHẨU XÓA CV";
                                return "MẬT KHẨU ADMIN";
                              })()}
                            </label>
                            <input
                              autoFocus
                              type="password"
                              placeholder="••••••"
                              value={adminPinInput}
                              onChange={(e) => setAdminPinInput(e.target.value)}
                              onKeyDown={(e) =>
                                e.key === "Enter" && confirmCVAction()
                              }
                              className="w-full px-7 py-4 bg-yellow-50/50 border border-transparent focus:border-yellow-200 outline-none rounded-3xl font-black text-slate-800 transition-all placeholder:text-slate-300"
                            />
                          </div>
                        )}
                    </div>

                    {cvActionModal.type !== "bulkRejectApp" &&
                      cvActionModal.type !== "reject" &&
                      !isActionUnlocked() && (
                        <div className="bg-yellow-50 p-4 rounded-3xl border border-yellow-100 flex items-start gap-3">
                          <div className="mt-0.5 text-yellow-600">
                            <AlertCircle size={16} />
                          </div>
                          <p className="text-[10px] text-yellow-700 font-bold leading-relaxed">
                            Lưu ý: Đây là thao tác quản trị hệ thống. Hãy đảm
                            bảo bạn có quyền thực hiện hành động này.
                          </p>
                        </div>
                      )}

                    <button
                      onClick={confirmCVAction}
                      disabled={
                        isProcessingAction ||
                        (cvActionModal.type !== "bulkRejectApp" &&
                          cvActionModal.type !== "reject" &&
                          !isActionUnlocked() &&
                          !adminPinInput) ||
                        ((cvActionModal.type === "bulkRejectApp" ||
                          cvActionModal.type === "reject") &&
                          !appRejectReasonInput.trim())
                      }
                      className={cn(
                        "w-full py-5 rounded-3xl font-black text-xs uppercase tracking-widest transition-all shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:grayscale",
                        cvActionModal.type === "bulkRejectApp" ||
                          cvActionModal.type === "reject"
                          ? "bg-slate-200 text-slate-700 hover:bg-slate-300 shadow-slate-200"
                          : "bg-yellow-400 text-amber-950 hover:bg-yellow-300 shadow-yellow-200",
                      )}
                    >
                      {isProcessingAction
                        ? "ĐANG XỬ LÝ..."
                        : "XÁC NHẬN THỰC HIỆN"}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </main>

      {/* CV Modal for Students */}
      <AnimatePresence>
        {/* System Chrome Alert Popup */}
        {chromeAlert && (
          <div
            key="chrome-alert"
            className="fixed inset-0 z-[130] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setChromeAlert(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[40px] pt-12 pb-10 px-8 lg:px-12 w-[calc(100vw-2rem)] max-w-md shadow-2xl relative overflow-hidden"
            >
              {(() => {
                const isSuccess =
                  chromeAlert?.toLowerCase().includes("thành công") ||
                  chromeAlert?.includes("Đã bật") ||
                  chromeAlert?.includes("Đã xóa") ||
                  chromeAlert?.includes("Đã duyệt") ||
                  chromeAlert?.includes("Đã hủy duyệt") ||
                  chromeAlert?.includes("Đã sao chép");
                return (
                  <>
                    <div
                      className={cn(
                        "absolute top-0 left-0 w-full h-2",
                        isSuccess ? "bg-green-500" : "bg-red-500",
                      )}
                    />

                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-widest">
                        THÔNG BÁO
                      </h3>
                      <button
                        onClick={() => setChromeAlert(null)}
                        className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-slate-100 transition-colors"
                      >
                        <X size={20} />
                      </button>
                    </div>

                    <div className="space-y-8">
                      <div className="flex items-start gap-4">
                        <div
                          className={cn(
                            "w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0",
                            isSuccess
                              ? "bg-green-50 text-green-500"
                              : "bg-red-50 text-red-500",
                          )}
                        >
                          {isSuccess ? (
                            <CheckCircle2 size={24} strokeWidth={2.5} />
                          ) : (
                            <AlertCircle size={24} strokeWidth={2.5} />
                          )}
                        </div>
                        <p className="text-sm font-medium text-slate-600 leading-relaxed pt-1">
                          {chromeAlert}
                        </p>
                      </div>

                      <button
                        onClick={() => setChromeAlert(null)}
                        className="w-full py-4 bg-slate-100 text-slate-700 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95"
                      >
                        Đóng
                      </button>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </div>
        )}

        {/* CV Save Success Popup */}
        {showCVSaveSuccess && (
          <div
            key="cv-save-success"
            className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCVSaveSuccess(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[40px] pt-12 pb-10 px-8 lg:px-12 w-[calc(100vw-2rem)] max-w-md shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-green-500" />

              <div className="flex items-center justify-between mb-10">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-widest">
                  THÀNH CÔNG
                </h3>
                <button
                  onClick={() => setShowCVSaveSuccess(false)}
                  className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-slate-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="flex flex-col items-center text-center space-y-4 py-4">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-green-500 mb-2">
                    <Check size={32} strokeWidth={3} />
                  </div>
                  <h4 className="text-lg font-bold text-slate-800">
                    Đã lưu CV thành công!
                  </h4>
                  <p className="text-sm font-medium text-slate-600">
                    Hồ sơ của bạn đã được ghi nhận. Vui lòng chờ bộ phận quản lý
                    phê duyệt.
                  </p>
                </div>

                <div className="bg-yellow-50 p-4 rounded-3xl border border-yellow-100 flex items-start gap-3">
                  <div className="p-1 max-w-fit bg-yellow-200/50 rounded-lg text-yellow-700">
                    <AlertCircle size={16} />
                  </div>
                  <p className="text-[10px] text-yellow-700 font-bold leading-relaxed">
                    Lưu ý: Sử dụng tính năng "Tra cứu CV" với 4 số cuối điện
                    thoại và mã PIN để kiểm tra trạng thái phê duyệt.
                  </p>
                </div>

                <button
                  onClick={() => setShowCVSaveSuccess(false)}
                  className="w-full py-5 bg-green-500 text-white rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-green-600 transition-all shadow-xl shadow-green-200 active:scale-[0.98]"
                >
                  ĐÃ HIỂU VÀ ĐÓNG
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Payment Image Popup */}
        {selectedPaymentImage && (
          <div
            key="payment-image-popup"
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          >
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
                  <h3 className="font-black text-slate-900 uppercase tracking-widest text-sm">
                    Bill Chuyển khoản
                  </h3>
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
          <div
            key="cv-modal"
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-amber-950/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[40px] p-8 max-w-2xl w-full shadow-2xl border border-yellow-200 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                    CV Học Viên
                  </h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    Hồ sơ năng lực cá nhân
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowCVModal(false);
                    setEditingCvId(null);
                    setFoundCVs([]);
                    setCvSearchPIN("");
                    setCvSearchPhoneLast4("");
                  }}
                  className="p-3 bg-slate-50 text-slate-400 hover:text-slate-600 rounded-2xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex bg-slate-100 p-1 rounded-2xl mb-8 flex-wrap">
                {[
                  {
                    id: "create",
                    label: "Tạo CV Mới",
                    icon: <Plus size={16} />,
                  },
                  {
                    id: "search",
                    label: "Tìm Kiếm CV",
                    icon: <Search size={16} />,
                  },
                  {
                    id: "reenroll",
                    label: "Đăng Ký Học Lại",
                    icon: <RefreshCw size={16} />,
                  },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (cvModalTab !== tab.id) {
                        setCvModalTab(tab.id as any);
                        setFoundCVs([]);
                        setCvSearchPIN("");
                        setCvSearchPhoneLast4("");
                        setCvAutoFillText("");
                        setCvFormData({
                          fullName: "",
                          phone: "",
                          age: "",
                          address: "",
                          job: "",
                          target: "",
                          guideName: "",
                          guidePhoneLast4: "",
                          password: "",
                          paymentImageUrl: "",
                          previousCourse: "",
                        });
                        setEditingCvId(null);
                      }
                    }}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all",
                      cvModalTab === tab.id
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700",
                    )}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {cvModalTab === "create" ? (
                <>
                  <div className="flex justify-end mb-4">
                    <button
                      type="button"
                      onClick={() => setShowCvTemplateModal(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-black hover:bg-blue-100 transition-all uppercase tracking-widest border border-blue-100"
                    >
                      <FileText size={14} />
                      Mẫu CV Học viên
                    </button>
                  </div>

                  {showCvTemplateModal && (
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-6 relative">
                      <button
                        type="button"
                        onClick={() => setShowCvTemplateModal(false)}
                        className="absolute top-2 right-2 p-2 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                      >
                        <X size={16} />
                      </button>
                      <h4 className="font-bold text-slate-800 text-sm mb-3">
                        Mẫu CV Đăng ký
                      </h4>
                      <pre className="text-xs font-medium text-slate-600 whitespace-pre-wrap bg-white p-4 rounded-xl border border-slate-100 mb-4">{`CV - ĐĂNG KÝ HỌC TẬP\n........................................\n1. Họ tên:\n2. Điện thoại:\n3. Tuổi:\n4. Địa Chỉ:\n5. Công Việc:\n6. Mong muốn:`}</pre>
                      <button
                        type="button"
                        onClick={handleCopyTemplate}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-900 transition-all"
                      >
                        <Copy size={16} />
                        Copy Mẫu
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleCVSubmit} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                        Dán thông tin từ văn bản (Hệ thống tự điền)
                      </label>
                      <textarea
                        placeholder="Coppy và dán nội dung CV tại đây..."
                        rows={4}
                        value={cvAutoFillText}
                        onChange={(e) => handleCVAutoFill(e.target.value)}
                        className="w-full px-5 py-3.5 bg-yellow-50 border border-yellow-100 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-medium text-sm resize-none italic"
                      />
                      <div className="bg-slate-50 p-3 rounded-xl text-[10px] text-slate-500 font-medium leading-relaxed">
                        Hướng dẫn: Dán nội dung theo định dạng "Họ tên...",
                        "Điện thoại..." để tự động điền các trường bên dưới.
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                          Họ tên học viên *
                        </label>
                        <input
                          required
                          type="text"
                          placeholder="Nguyễn Văn A"
                          value={cvFormData.fullName}
                          onChange={(e) =>
                            setCvFormData({
                              ...cvFormData,
                              fullName: e.target.value,
                            })
                          }
                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                          Điện thoại *
                        </label>
                        <input
                          required
                          type="tel"
                          placeholder="090..."
                          value={cvFormData.phone}
                          onChange={(e) =>
                            setCvFormData({
                              ...cvFormData,
                              phone: e.target.value,
                            })
                          }
                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                          Tuổi *
                        </label>
                        <input
                          required
                          type="text"
                          placeholder="25"
                          value={cvFormData.age}
                          onChange={(e) =>
                            setCvFormData({
                              ...cvFormData,
                              age: e.target.value,
                            })
                          }
                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                          Địa Chi
                        </label>
                        <input
                          type="text"
                          placeholder="Hà Nội..."
                          value={cvFormData.address}
                          onChange={(e) =>
                            setCvFormData({
                              ...cvFormData,
                              address: e.target.value,
                            })
                          }
                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                        Công Việc
                      </label>
                      <input
                        type="text"
                        placeholder="Nhân viên văn phòng..."
                        value={cvFormData.job}
                        onChange={(e) =>
                          setCvFormData({ ...cvFormData, job: e.target.value })
                        }
                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                        Mong muốn
                      </label>
                      <textarea
                        placeholder="Bạn mong muốn điều gì sau khóa học?"
                        rows={3}
                        value={cvFormData.target}
                        onChange={(e) =>
                          setCvFormData({
                            ...cvFormData,
                            target: e.target.value,
                          })
                        }
                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm resize-none"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                          Tên hướng dẫn viên *
                        </label>
                        <input
                          required
                          type="text"
                          placeholder="Tên người hướng dẫn..."
                          value={cvFormData.guideName}
                          onChange={(e) =>
                            setCvFormData({
                              ...cvFormData,
                              guideName: e.target.value,
                            })
                          }
                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                          4 số cuối SĐT của HDV *
                        </label>
                        <input
                          required
                          type="text"
                          maxLength={4}
                          placeholder="Ví dụ: 1234"
                          value={cvFormData.guidePhoneLast4}
                          onChange={(e) =>
                            setCvFormData({
                              ...cvFormData,
                              guidePhoneLast4: e.target.value,
                            })
                          }
                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                        Mã PIN bảo mật CV (Để tìm kiếm sau này) *
                      </label>
                      <input
                        required
                        type="password"
                        placeholder="Tối thiểu 4 ký tự"
                        value={cvFormData.password}
                        onChange={(e) =>
                          setCvFormData({
                            ...cvFormData,
                            password: e.target.value,
                          })
                        }
                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-black text-sm tracking-widest"
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                        Ảnh chuyển khoản thành công *
                      </label>
                      <div
                        onClick={() =>
                          document.getElementById("payment-upload")?.click()
                        }
                        className={cn(
                          "w-full aspect-video rounded-3xl border-2 border-dashed flex flex-col items-center justify-center gap-3 cursor-pointer transition-all overflow-hidden relative group",
                          cvFormData.paymentImageUrl
                            ? "border-green-400 bg-green-50"
                            : "border-slate-200 bg-slate-50 hover:border-yellow-400 hover:bg-yellow-50",
                        )}
                      >
                        {cvFormData.paymentImageUrl ? (
                          <>
                            <img
                              src={cvFormData.paymentImageUrl}
                              alt="Payment"
                              className="w-full h-full object-contain"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <p className="text-white text-[10px] font-black uppercase tracking-widest">
                                Thay đổi ảnh
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCvFormData((prev) => ({
                                  ...prev,
                                  paymentImageUrl: "",
                                }));
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
                              <p className="text-xs font-bold text-slate-600">
                                Bấm để tải ảnh chuyển khoản
                              </p>
                              <p className="text-[9px] font-medium text-slate-400 mt-1 uppercase tracking-tight">
                                Kích thước phim dưới 1MB
                              </p>
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
                          <span>
                            Đã tải lên ảnh bill chuyển khoản thành công
                          </span>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmittingCV}
                      className="w-full py-4 bg-amber-950 text-yellow-400 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isSubmittingCV ? "Đang lưu..." : "Lưu Hồ Sơ CV"}
                    </button>
                  </form>
                </>
              ) : cvModalTab === "reenroll" ? (
                <>
                  <form onSubmit={handleCVSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                          Họ tên học viên *
                        </label>
                        <input
                          type="text"
                          placeholder="Nguyễn Văn A"
                          value={cvFormData.fullName}
                          onChange={(e) =>
                            setCvFormData({
                              ...cvFormData,
                              fullName: e.target.value,
                            })
                          }
                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                          Điện thoại *
                        </label>
                        <input
                          type="tel"
                          placeholder="090..."
                          value={cvFormData.phone}
                          onChange={(e) =>
                            setCvFormData({
                              ...cvFormData,
                              phone: e.target.value,
                            })
                          }
                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                          Tuổi *
                        </label>
                        <input
                          type="text"
                          placeholder="25"
                          value={cvFormData.age}
                          onChange={(e) =>
                            setCvFormData({
                              ...cvFormData,
                              age: e.target.value,
                            })
                          }
                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                          Tên hướng dẫn viên *
                        </label>
                        <input
                          type="text"
                          placeholder="Tên người hướng dẫn..."
                          value={cvFormData.guideName}
                          onChange={(e) =>
                            setCvFormData({
                              ...cvFormData,
                              guideName: e.target.value,
                            })
                          }
                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm"
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                          Khóa đã tham gia *
                        </label>
                        <input
                          type="text"
                          placeholder="Tên khóa hoặc mã khóa..."
                          value={cvFormData.previousCourse || ""}
                          onChange={(e) =>
                            setCvFormData({
                              ...cvFormData,
                              previousCourse: e.target.value,
                            })
                          }
                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-bold text-sm text-slate-700"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmittingCV}
                      className="w-full py-4 bg-amber-950 text-yellow-400 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isSubmittingCV ? "Đang lưu..." : "Nộp Đăng Ký Học Lại"}
                    </button>
                  </form>
                </>
              ) : (
                <div className="space-y-8">
                  <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 text-[10px] text-blue-600 font-bold text-center leading-relaxed mb-4">
                      Vui lòng nhập đúng 4 số cuối số điện thoại và mã PIN bạn
                      đã tạo khi nộp hồ sơ để xem trạng thái.
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                          4 số cuối SĐT (bạn hoặc HDV)
                        </label>
                        <input
                          type="text"
                          maxLength={4}
                          placeholder="VD: 1234"
                          value={cvSearchPhoneLast4}
                          onChange={(e) =>
                            setCvSearchPhoneLast4(e.target.value)
                          }
                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-black text-sm tracking-widest text-center"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                          Mã PIN đã tạo
                        </label>
                        <input
                          type="password"
                          placeholder="Mã PIN"
                          value={cvSearchPIN}
                          onChange={(e) => setCvSearchPIN(e.target.value)}
                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white focus:border-yellow-400 transition-all font-black text-sm tracking-widest text-center"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleCVSearch}
                      disabled={isSearchingCV}
                      className="w-full py-4 bg-yellow-400 text-amber-950 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-yellow-300 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                    >
                      {isSearchingCV
                        ? "Đang tìm kiếm..."
                        : "Kiểm tra trạng thái hồ sơ"}
                    </button>
                  </div>

                  {foundCVs.length > 0 && (
                    <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
                      <div className="text-sm font-bold text-slate-600 bg-slate-100 py-2 px-4 rounded-xl flex justify-between items-center">
                        Tìm thấy {foundCVs.length} hồ sơ khớp với thông tin.
                      </div>
                      {foundCVs.map((foundCV) => (
                        <motion.div
                          key={foundCV.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-8 bg-yellow-50 rounded-3xl border border-yellow-200 space-y-6 relative overflow-hidden"
                        >
                          <div className="flex items-center justify-between border-b border-yellow-200 pb-4">
                            <h4 className="text-xl font-black text-slate-900 tracking-tight pr-4">
                              {foundCV.fullName}{" "}
                              <span className="text-xs text-slate-500 font-medium ml-2">
                                ({foundCV.age} tuổi)
                              </span>
                            </h4>
                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={cn(
                                  "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest",
                                  foundCV.status === "approved"
                                    ? "bg-green-100 text-green-700"
                                    : foundCV.status === "rejected"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-orange-100 text-orange-700 animate-pulse",
                                )}
                              >
                                {foundCV.status === "approved"
                                  ? "Đã phê duyệt"
                                  : foundCV.status === "rejected"
                                    ? "Bị từ chối"
                                    : "Chờ phê duyệt"}
                              </span>
                              {!foundCV.appApproved && (
                                <button
                                  onClick={() => startEditCV(foundCV)}
                                  className="p-2 bg-white text-blue-600 rounded-lg hover:bg-blue-50 transition-colors shadow-sm border border-blue-100"
                                  title="Chỉnh sửa thông tin"
                                >
                                  <Edit3 size={14} />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 pt-2">
                            {foundCV.studentId && (
                              <div className="bg-purple-100 text-purple-700 px-3 py-1.5 rounded-xl border border-purple-200 flex flex-col justify-center shadow-sm">
                                <span className="text-[9px] font-black uppercase tracking-widest leading-none mb-0.5 opacity-70">
                                  Mã HV
                                </span>
                                <span className="font-black text-sm leading-none">
                                  {foundCV.studentId}
                                </span>
                              </div>
                            )}
                            {foundCV.studyGroup && (
                              <div className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-xl border border-blue-200 flex flex-col justify-center shadow-sm">
                                <span className="text-[9px] font-black uppercase tracking-widest leading-none mb-0.5 opacity-70">
                                  Group Học Tập
                                </span>
                                <span className="font-black text-sm leading-none uppercase">
                                  {foundCV.studyGroup}
                                </span>
                              </div>
                            )}
                            {foundCV.companion && (
                              <div className="bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl border border-emerald-200 flex flex-col justify-center shadow-sm">
                                <span className="text-[9px] font-black uppercase tracking-widest leading-none mb-0.5 opacity-70">
                                  Người Đồng Hành
                                </span>
                                <span className="font-black text-sm leading-none">
                                  {foundCV.companion}
                                </span>
                              </div>
                            )}
                            {foundCV.guideName && (
                              <div className="bg-amber-100 text-amber-700 px-3 py-1.5 rounded-xl border border-amber-200 flex flex-col justify-center shadow-sm">
                                <span className="text-[9px] font-black uppercase tracking-widest leading-none mb-0.5 opacity-70">
                                  Mentor (HDV)
                                </span>
                                <span className="font-black text-sm leading-none">
                                  {foundCV.guideName}
                                </span>
                              </div>
                            )}
                          </div>

                          {foundCV.status === "pending" && (
                            <div className="bg-orange-50 border border-orange-100 p-3 rounded-xl text-[10px] text-orange-600 font-bold flex items-center gap-2">
                              <Clock size={12} />
                              <span>
                                Hồ sơ của bạn đang chờ Kế toán kiểm tra và phê
                                duyệt.
                              </span>
                            </div>
                          )}

                          {foundCV.status === "rejected" && (
                            <div className="bg-red-50 border border-red-100 p-4 rounded-xl text-[10px] text-red-600 font-bold flex flex-col gap-2 mt-2">
                              <div className="flex items-center gap-2">
                                <X size={14} />
                                <span className="text-sm">
                                  Hồ sơ của bạn đã bị từ chối bởi Kế toán. Vui
                                  lòng chỉnh sửa lại.
                                </span>
                              </div>
                              {foundCV.cancellationReason && (
                                <p className="mt-2 text-xs font-medium italic p-3 bg-red-100/50 rounded-lg">
                                  <span className="text-red-400 font-black not-italic mr-1">
                                    Lý do từ chối:
                                  </span>
                                  {foundCV.cancellationReason}
                                </p>
                              )}
                            </div>
                          )}

                          {foundCV.status === "approved" && (
                            <div
                              className={cn(
                                "border p-4 rounded-xl text-[10px] font-bold flex flex-col gap-2 mt-2",
                                foundCV.appApproved === true
                                  ? "bg-blue-50 border-blue-100 text-blue-600"
                                  : foundCV.appRejectedReason
                                    ? "bg-red-50 border-red-100 text-red-600"
                                    : "bg-green-50 border-green-100 text-green-600",
                              )}
                            >
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                  {foundCV.appApproved === true ? (
                                    <Smartphone size={14} />
                                  ) : foundCV.appRejectedReason ? (
                                    <X size={14} />
                                  ) : (
                                    <Check size={14} />
                                  )}
                                  <span className="text-sm">
                                    {foundCV.appApproved === true
                                      ? "Đã được kích hoạt trên App"
                                      : foundCV.appRejectedReason
                                        ? "Duyệt App thất bại. Vui lòng sửa lỗi và đợi cập nhật lại."
                                        : "Đã qua bước Kế toán phê duyệt. Đang chờ Duyệt App."}
                                  </span>
                                </div>
                              </div>
                              {foundCV.appRejectedReason && (
                                <p className="mt-2 text-xs font-medium italic p-3 bg-red-100/50 rounded-lg">
                                  <span className="text-red-400 font-black not-italic mr-1">
                                    Lý do từ chối Duyệt App:
                                  </span>
                                  {foundCV.appRejectedReason}
                                </p>
                              )}
                            </div>
                          )}

                          {foundCV.type === "reenroll" ? (
                            <div className="grid grid-cols-2 gap-6">
                              <div className="col-span-2 pt-2 border-t border-yellow-100">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                  Tham gia
                                </p>
                                <p className="text-xs font-bold text-slate-700">
                                  {foundCV.previousCourse || "---"}
                                </p>
                              </div>
                              <div className="pt-2 border-t border-yellow-100">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                  Liên hệ
                                </p>
                                <p className="text-xs font-bold text-slate-700">
                                  {foundCV.phone}
                                </p>
                              </div>
                              <div className="pt-2 border-t border-yellow-100">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                  Hướng dẫn viên
                                </p>
                                <p className="text-xs font-bold text-slate-700">
                                  {foundCV.guideName}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="grid grid-cols-2 gap-6">
                                <div>
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                    Công việc / Địa chỉ
                                  </p>
                                  <p className="text-xs font-medium text-slate-500">
                                    {foundCV.job || "---"}
                                  </p>
                                  <p className="text-xs font-medium text-slate-500 truncate">
                                    {foundCV.address || "---"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                    Liên hệ
                                  </p>
                                  <p className="text-xs font-bold text-slate-700">
                                    {foundCV.phone}
                                  </p>
                                </div>
                                <div className="col-span-2 pt-2 border-t border-yellow-100">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                    Hướng dẫn viên
                                  </p>
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-bold text-slate-700">
                                      {foundCV.guideName}
                                    </p>
                                    <p className="text-[10px] font-black text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-lg">
                                      SĐT: ...{foundCV.guidePhoneLast4}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                  Mong muốn
                                </p>
                                <p className="text-xs text-slate-800 leading-relaxed font-medium bg-white/50 p-4 rounded-xl border border-white/50 italic">
                                  {foundCV.target || "Không có"}
                                </p>
                              </div>

                              {foundCV.paymentImageUrl && (
                                <div className="space-y-3">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                    Bill Chuyển khoản
                                  </p>
                                  <div className="rounded-2xl overflow-hidden border border-yellow-200 bg-white flex justify-center">
                                    <img
                                      src={foundCV.paymentImageUrl}
                                      alt="Chuyển khoản"
                                      className="max-w-full h-auto max-h-64 object-contain"
                                    />
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </motion.div>
                      ))}
                    </div>
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
                    {manageAppointment.status === "cancelled"
                      ? "Khôi phục lịch hẹn"
                      : "Quản lý lịch hẹn"}
                  </h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    {manageAppointment.status === "cancelled"
                      ? "Dành cho Quản trị viên"
                      : "Dành cho Người đặt & Admin"}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowManageModal(false);
                    setManagePassword("");
                    setIsEditingManageTime(false);
                  }}
                  className="p-2 bg-slate-50 text-slate-400 hover:text-slate-600 rounded-full transition-colors"
                >
                  <ChevronRight size={20} className="rotate-45" />
                </button>
              </div>

              {isEditingManageTime ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                      Chọn Ngày
                    </label>
                    <input
                      type="date"
                      value={manageEditDateStr}
                      onChange={handleEditTimeDateChange}
                      min={format(new Date(), "yyyy-MM-dd")}
                      className="w-full pl-4 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-yellow-400 focus:bg-white transition-all outline-none font-semibold text-slate-600"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                      Chọn Giờ
                    </label>
                    {isFetchingEditSlots ? (
                       <p className="text-xs text-slate-500 font-medium pb-2 px-1">Đang tải...</p>
                    ) : (manageEditSlots.length === 0 ? (
                       <p className="text-xs text-red-500 font-medium pb-2 px-1">Không có giờ trống trong ngày này.</p>
                    ) : (
                      <div className="grid grid-cols-4 gap-2">
                        {manageEditSlots.map(s => (
                          <button
                            key={s}
                            onClick={() => setManageEditTime(s)}
                            className={cn(
                              "py-2 rounded-xl text-sm font-bold border transition-all",
                              manageEditTime === s
                                ? "bg-yellow-400 border-yellow-400 text-amber-950 shadow-sm"
                                : "bg-white border-slate-200 text-slate-600 hover:border-yellow-400"
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 inline-flex items-center gap-1.5">
                      <MessageSquare size={12} className="text-yellow-600" />
                      Lý do thay đổi (Tùy chọn)
                    </label>
                    <textarea
                      rows={2}
                      value={manageEditReason}
                      onChange={(e) => setManageEditReason(e.target.value)}
                      placeholder="Ghi chú thêm... "
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-yellow-400 focus:bg-white transition-all outline-none text-sm font-medium placeholder:text-slate-400 resize-none italic"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setIsEditingManageTime(false)}
                      disabled={isManaging}
                      className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-[0.98] disabled:opacity-40"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={onSaveManageEditTime}
                      disabled={isManaging || !manageEditDateStr || !manageEditTime || isFetchingEditSlots}
                      className="flex-1 py-4 bg-yellow-400 text-amber-950 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-yellow-200 hover:bg-yellow-300 transition-all active:scale-[0.98] disabled:opacity-40"
                    >
                      {isManaging ? "Đang lưu..." : "Xác nhận"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-100 space-y-2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                      Chi tiết
                    </p>
                <p className="text-sm font-semibold text-slate-700">
                  {manageAppointment.date} Lúc {manageAppointment.startTime}
                </p>
                <div className="pt-2 border-t border-slate-200/50 mt-2 space-y-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">
                    Học viên
                  </p>
                  <p className="text-sm text-slate-600">
                    {manageAppointment.clientName}
                  </p>

                  {manageAppointment.status === "cancelled" && (
                    <div className="bg-red-50 p-2 rounded-lg border border-red-100 mt-2">
                      <p className="text-[10px] text-red-400 font-bold uppercase">
                        Trạng thái: Bận đột xuất / Đã hủy
                      </p>
                      <p className="text-xs text-red-600 italic font-medium">
                        Lý do:{" "}
                        {manageAppointment.cancellationReason ||
                          "Không rõ lý do"}
                      </p>
                    </div>
                  )}

                  {(manageAppointment as any).timeEditedByAdmin && (
                    <div className="bg-yellow-50 p-2 rounded-lg border border-yellow-100 mt-2">
                      <p className="text-[10px] text-yellow-600 font-bold uppercase">
                        Đã được Đổi Giờ (bởi Admin)
                      </p>
                      {(manageAppointment as any).timeEditReason && (
                        <p className="text-xs text-yellow-700 italic font-medium">
                          Lý do: {(manageAppointment as any).timeEditReason}
                        </p>
                      )}
                    </div>
                  )}

                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">
                    Hướng dẫn viên
                  </p>
                  <p className="text-sm text-slate-600">
                    {manageAppointment.guide}
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">
                    Câu hỏi
                  </p>
                  <p className="text-sm text-slate-600 italic">
                    "{manageAppointment.question}"
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                {manageAppointment.status === "active" && (
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
                        onChange={(e) => setManagePassword(e.target.value)}
                        placeholder={
                          isAdmin
                            ? "Đã xác minh Quyền Admin"
                            : "Nhập Mã PIN đã tạo..."
                        }
                        disabled={isAdmin}
                        className={cn(
                          "w-full pl-10 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:border-yellow-400 focus:bg-white transition-all outline-none text-sm font-bold tracking-widest placeholder:tracking-normal placeholder:font-medium",
                          isAdmin &&
                            "opacity-60 border-slate-100 bg-slate-50/50 cursor-not-allowed",
                        )}
                      />
                    </div>
                  </div>
                )}

                {isAdmin && manageAppointment.status === "active" && (
                  <div className="space-y-4">
                    <div
                      className="flex items-center gap-3 p-4 bg-yellow-50 rounded-2xl border border-yellow-100 cursor-pointer transition-all hover:bg-yellow-100/50"
                      onClick={() => setIsSuddenCancel(!isSuddenCancel)}
                    >
                      <div
                        className={cn(
                          "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                          isSuddenCancel
                            ? "bg-amber-950 border-amber-950 text-white"
                            : "bg-white border-slate-300",
                        )}
                      >
                        {isSuddenCancel && <CheckCircle2 size={14} />}
                      </div>
                      <div className="flex-1">
                        <p className="text-[11px] font-black text-amber-950 uppercase tracking-tight">
                          Hủy lịch đột xuất
                        </p>
                        <p className="text-[9px] text-amber-800 font-medium tracking-tight">
                          Khung giờ này sẽ bị khóa và hiển thị "Bận đột xuất"
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 inline-flex items-center gap-1.5">
                        <MessageSquare size={12} className="text-yellow-600" />
                        Lý do hủy {isSuddenCancel ? "đột xuất" : ""}
                      </label>
                      <textarea
                        rows={3}
                        value={adminReason}
                        onChange={(e) => setAdminReason(e.target.value)}
                        placeholder={
                          isSuddenCancel
                            ? "Nhập lý do (vd: Có việc bận đột xuất...)"
                            : "Nhập lý do (vd: Thông tin Học viên không chính xác...)"
                        }
                        className="w-full px-4 py-3 bg-red-50/30 border border-red-100 rounded-2xl focus:ring-2 focus:ring-red-400 focus:bg-white transition-all outline-none text-sm font-medium placeholder:text-slate-300 resize-none italic"
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  {manageAppointment.status === "active" ? (
                    <>
                      {isAdmin && (
                        <button
                          onClick={handleEditManageTimeSetup}
                          disabled={isManaging}
                          className="flex-1 py-4 bg-slate-100 text-slate-700 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-[0.98] disabled:opacity-40"
                        >
                          Đổi Giờ
                        </button>
                      )}
                      <button
                        onClick={() => handleCancelAppointment(false)}
                        disabled={isManaging || (!isAdmin && !managePassword)}
                        className={cn(
                          "flex-1 py-4 bg-red-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-red-200 hover:bg-red-600 transition-all active:scale-[0.98] disabled:opacity-40",
                          isAdmin && "bg-amber-950 shadow-amber-950/20",
                        )}
                      >
                        {isManaging
                          ? "Đang hủy..."
                          : isAdmin
                            ? "Hủy (Lưu lại)"
                            : "Xác nhận hủy"}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleRestoreAppointment()}
                      disabled={isManaging || !isAdmin}
                      className="flex-1 py-4 bg-yellow-400 text-amber-950 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-yellow-200 hover:bg-yellow-300 transition-all active:scale-[0.98] disabled:opacity-40"
                    >
                      {isManaging ? "Đang khôi phục..." : "Khôi phục lịch hẹn"}
                    </button>
                  )}

                  {isAdmin && (
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            "Xóa vĩnh viễn dữ liệu này? Hành động không thể hoàn tác.",
                          )
                        ) {
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
              </>
              )}
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
              <h2 className="text-xl font-bold text-slate-900 mb-2">
                Đã đặt lịch thành công
              </h2>
              <p className="text-slate-500 text-sm leading-relaxed mb-8">
                Lịch hẹn đã được ghi nhận. Hãy nhớ Mã PIN để có thể hủy hẹn khi
                cần.
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
                onClick={() => {
                  setShowBookingModal(false);
                  setSelectedSlot(null);
                }}
                className="absolute top-8 right-8 p-3 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-2xl transition-all"
              >
                <X size={24} />
              </button>

              <div className="mb-10 text-center">
                <div className="inline-flex items-center gap-4 bg-yellow-50 px-6 py-2 rounded-full border border-yellow-100 mb-4">
                  <Clock size={16} className="text-yellow-600" />
                  <span className="text-xs font-black text-yellow-700 uppercase tracking-widest">
                    ĐANG ĐẶT CHỖ LÚC {selectedSlot}
                  </span>
                </div>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">
                  THÔNG TIN KẾT NỐI
                </h3>
                <p className="text-sm text-slate-400 font-medium italic mt-1">
                  Vui lòng điền đầy đủ các thông tin bên dưới
                </p>
              </div>

              <form
                onSubmit={handleBooking}
                className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6"
              >
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                    Tên Học viên
                  </label>
                  <input
                    required
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Nhập tên..."
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-yellow-400 focus:bg-white transition-all outline-none text-base font-bold placeholder:text-slate-300 shadow-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                    Hướng dẫn viên
                  </label>
                  <input
                    required
                    type="text"
                    value={formData.guide}
                    onChange={(e) =>
                      setFormData({ ...formData, guide: e.target.value })
                    }
                    placeholder="Ví dụ: Sư Huynh"
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-yellow-400 focus:bg-white transition-all outline-none text-base font-bold placeholder:text-slate-300 shadow-sm"
                  />
                </div>

                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                    Vấn đề cần hỗ trợ
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={formData.question}
                    onChange={(e) =>
                      setFormData({ ...formData, question: e.target.value })
                    }
                    placeholder="Bạn muốn trao đổi về điều gì?"
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-yellow-400 focus:bg-white transition-all outline-none text-base font-bold placeholder:text-slate-300 resize-none shadow-sm"
                  />
                </div>

                <div className="md:col-span-2 space-y-2">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                      Mật khẩu hủy lịch
                    </label>
                    <span className="text-[9px] text-yellow-600 font-bold uppercase tracking-widest">
                      (Ghi nhớ để tự hủy khi cần)
                    </span>
                  </div>
                  <input
                    required
                    type="text"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
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
                      "XÁC NHẬN ĐẶT LỊCH NGAY"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowBookingModal(false);
                      setSelectedSlot(null);
                    }}
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
                <h3 className="text-xl font-black text-slate-900 uppercase">
                  Chọn ngày kết nối
                </h3>
                <button
                  onClick={() => setShowCalendarPicker(false)}
                  className="p-2 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-xl"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between bg-slate-50 p-4 rounded-3xl">
                  <button
                    onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
                    className="p-2 hover:bg-white rounded-xl text-slate-400 shadow-sm transition-all"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <span className="font-black text-sm text-slate-700 uppercase tracking-widest">
                    {format(currentMonth, "MMMM yyyy", { locale: vi })}
                  </span>
                  <button
                    onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                    className="p-2 hover:bg-white rounded-xl text-slate-400 shadow-sm transition-all"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => (
                    <div
                      key={d}
                      className="text-center text-[10px] font-black text-slate-300 uppercase py-2"
                    >
                      {d}
                    </div>
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
                                  : "text-slate-600 hover:bg-yellow-50 hover:text-yellow-700",
                          )}
                        >
                          {format(day, "d")}
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

      {/* Role Unlock Modal */}
      <AnimatePresence>
        {isAdmin &&
          activeAdminTab === "cvs" &&
          adminCvTab !== "status" &&
          !unlockedRoles[adminCvTab as keyof typeof unlockedRoles] && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-white rounded-[40px] p-10 max-w-sm w-full shadow-2xl border border-yellow-200 text-center relative"
              >
                <button
                  onClick={() => {
                    setAdminCvTab("status");
                    setRolePasswords({
                      ...rolePasswords,
                      [adminCvTab as keyof typeof rolePasswords]: "",
                    });
                  }}
                  className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors bg-slate-100 hover:bg-slate-200 p-2 rounded-full"
                >
                  <X size={20} />
                </button>

                <div className="w-20 h-20 bg-slate-50 flex items-center justify-center rounded-3xl mx-auto mb-6 shadow-inset border border-slate-100">
                  <Lock size={32} className="text-slate-300" />
                </div>
                <h4 className="font-black text-slate-800 text-xl tracking-tight mb-2 uppercase">
                  Yêu cầu mở khóa
                </h4>
                <p className="text-sm text-slate-500 font-medium mb-8">
                  Bạn cần cung cấp mật khẩu để truy cập không gian làm việc của{" "}
                  <strong className="text-slate-800">
                    {adminCvTab === "accountant"
                      ? "Kế toán"
                      : adminCvTab === "app_approver"
                        ? "Duyệt App"
                        : adminCvTab === "learning"
                          ? "Học tập"
                          : "Xóa CV"}
                  </strong>
                  .
                </p>
                <div className="space-y-4">
                  <input
                    type="password"
                    placeholder="Nhập mã PIN..."
                    autoFocus
                    value={
                      rolePasswords[
                        adminCvTab as
                          | "accountant"
                          | "app_approver"
                          | "delete"
                          | "learning"
                      ]
                    }
                    onChange={(e) =>
                      setRolePasswords({
                        ...rolePasswords,
                        [adminCvTab as keyof typeof rolePasswords]:
                          e.target.value,
                      })
                    }
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      handleRoleUnlock(
                        adminCvTab as
                          | "accountant"
                          | "app_approver"
                          | "delete"
                          | "learning",
                      )
                    }
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 focus:border-blue-400 outline-none rounded-2xl font-bold text-slate-800 text-center tracking-widest shadow-inner transition-all"
                  />
                  <button
                    onClick={() =>
                      handleRoleUnlock(
                        adminCvTab as
                          | "accountant"
                          | "app_approver"
                          | "delete"
                          | "learning",
                      )
                    }
                    disabled={
                      !rolePasswords[
                        adminCvTab as
                          | "accountant"
                          | "app_approver"
                          | "delete"
                          | "learning"
                      ]
                    }
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    Mở khóa
                  </button>
                </div>
              </motion.div>
            </div>
          )}
      </AnimatePresence>

      {/* Create Course Modal */}
      <AnimatePresence>
        {showCreateCourseModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[32px] p-6 max-w-3xl w-full shadow-2xl relative my-auto"
            >
              <button
                onClick={() => setShowCreateCourseModal(false)}
                className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full transition-colors"
              >
                <X size={20} />
              </button>

              <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2 uppercase tracking-tight">
                <GraduationCap className="text-purple-600" />
                Tạo Khóa Học Mới
              </h3>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Tên khóa học
                  </label>
                  <input
                    type="text"
                    value={courseForm.name}
                    onChange={(e) =>
                      setCourseForm((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    placeholder="Nhập tên khóa học..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                      Từ ngày (CV)
                    </label>
                    <input
                      type="date"
                      value={courseForm.start}
                      onChange={(e) =>
                        setCourseForm((prev) => ({
                          ...prev,
                          start: e.target.value,
                        }))
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                      Đến ngày (CV)
                    </label>
                    <input
                      type="date"
                      value={courseForm.end}
                      onChange={(e) =>
                        setCourseForm((prev) => ({
                          ...prev,
                          end: e.target.value,
                        }))
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Ngày chốt danh sách
                  </label>
                  <input
                    type="date"
                    value={courseForm.closingDate}
                    onChange={(e) =>
                      setCourseForm((prev) => ({
                        ...prev,
                        closingDate: e.target.value,
                      }))
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"
                  />
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mt-4">
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-slate-800">Tự động thêm CV vào danh sách</h3>
                  <p className="text-xs font-medium text-slate-500">Tự động đẩy học viên mới vào group khi đăng ký thành công nếu thời gian nộp CV của họ nằm sau ngày bên dưới và trước ngày chốt danh sách.</p>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Bắt đầu thêm từ ngày (theo ngày gửi CV)
                  </label>
                  <input
                    type="date"
                    value={courseForm.autoAddFromDate}
                    onChange={(e) =>
                      setCourseForm((prev) => ({
                        ...prev,
                        autoAddFromDate: e.target.value,
                      }))
                    }
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all"
                  />
                </div>
              </div>

              <div className="max-h-[30vh] overflow-y-auto pr-2 space-y-3 mt-6 mb-6">
                {(() => {
                  const filteredLearningCvs = cvs.filter((cv) => {
                    if (!courseForm.start || !courseForm.end) return true;
                    const cvDate = cv.createdAt
                      ? cv.createdAt.toDate
                        ? cv.createdAt.toDate().getTime()
                        : typeof cv.createdAt === "number"
                          ? cv.createdAt
                          : new Date(cv.createdAt).getTime()
                      : 0;
                    const startDate = new Date(courseForm.start).setHours(
                      0,
                      0,
                      0,
                      0,
                    );
                    const endDate = new Date(courseForm.end).setHours(
                      23,
                      59,
                      59,
                      999,
                    );
                    return cvDate >= startDate && cvDate <= endDate;
                  });

                  if (filteredLearningCvs.length === 0) {
                    return (
                      <div className="py-12 text-center text-slate-500 font-medium">
                        Không tìm thấy CV nào trong khoảng thời gian này
                      </div>
                    );
                  }

                  return filteredLearningCvs.map((cv) => (
                    <div
                      key={cv.id}
                      className="flex items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-purple-200 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedLearningCvIds.includes(cv.id)}
                        onChange={(e) => {
                          if (e.target.checked)
                            setSelectedLearningCvIds((prev) => [
                              ...prev,
                              cv.id,
                            ]);
                          else
                            setSelectedLearningCvIds((prev) =>
                              prev.filter((id) => id !== cv.id),
                            );
                        }}
                        className="w-5 h-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 mr-4"
                      />
                      <div className="flex-1">
                        <p className="font-bold text-slate-800 text-sm">
                          {cv.fullName} ({cv.age} tuổi)
                        </p>
                        <p className="text-xs text-slate-500">
                          HDV: {cv.guideName} -{" "}
                          {cv.status === "completed"
                            ? "Hoàn thành"
                            : cv.status === "pending"
                              ? "Chờ duyệt"
                              : cv.status === "processing"
                                ? "Đang duyệt"
                                : "Từ chối"}
                        </p>
                      </div>
                      <div className="text-xs font-black text-slate-400">
                        Ngày tạo:{" "}
                        {cv.createdAt
                          ? format(
                              cv.createdAt.toDate
                                ? cv.createdAt.toDate()
                                : typeof cv.createdAt === "number"
                                  ? new Date(cv.createdAt)
                                  : new Date(cv.createdAt),
                              "dd/MM/yyyy",
                            )
                          : "N/A"}
                      </div>
                    </div>
                  ));
                })()}
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100 gap-3">
                <button
                  onClick={() => setShowCreateCourseModal(false)}
                  className="px-6 py-3 font-bold text-slate-500 hover:text-slate-800 transition-colors uppercase tracking-widest text-xs"
                >
                  Hủy
                </button>
                <button
                  onClick={async () => {
                    if (
                      !courseForm.name ||
                      !courseForm.start ||
                      !courseForm.end ||
                      !courseForm.closingDate
                    ) {
                      setChromeAlert(
                        "Vui lòng nhập đầy đủ Tên khóa học, thời gian và ngày chốt danh sách.",
                      );
                      return;
                    }
                    if (
                      !editingCourseId &&
                      selectedLearningCvIds.length === 0
                    ) {
                      setChromeAlert("Vui lòng chọn ít nhất 1 học viên.");
                      return;
                    }

                    try {
                      if (editingCourseId) {
                        const course = courses.find(
                          (c) => c.id === editingCourseId,
                        );
                        if (course) {
                          const removedIds = course.studentIds.filter(
                            (id) => !selectedLearningCvIds.includes(id),
                          );
                          if (removedIds.length > 0) {
                            await Promise.all(
                              removedIds.map(async (id) => {
                                try {
                                  await updateDoc(doc(db, "cvs", id), {
                                    companion: deleteField(),
                                    studyGroup: deleteField(),
                                    studentId: deleteField(),
                                  });
                                } catch (err) {
                                  console.warn("CV may have been deleted", err);
                                }
                              }),
                            );

                            const updatedTracking = course.tracking
                              ? { ...course.tracking }
                              : {};
                            removedIds.forEach((id) => {
                              delete updatedTracking[id];
                            });

                            await updateDoc(
                              doc(db, "courses", editingCourseId),
                              {
                                name: courseForm.name,
                                startDate: courseForm.start,
                                endDate: courseForm.end,
                                closingDate: courseForm.closingDate,
                                studentIds: selectedLearningCvIds,
                                autoAddFromDate: courseForm.autoAddFromDate || deleteField(),
                                removedStudentIds: [
                                  ...(course.removedStudentIds || []),
                                  ...removedIds,
                                ],
                                tracking: updatedTracking,
                              },
                            );
                            setChromeAlert("Đã cập nhật khóa học!");
                            setShowCreateCourseModal(false);
                            setSelectedLearningCvIds([]);
                            setEditingCourseId(null);
                            return;
                          }
                        }

                        await updateDoc(doc(db, "courses", editingCourseId), {
                          name: courseForm.name,
                          startDate: courseForm.start,
                          endDate: courseForm.end,
                          closingDate: courseForm.closingDate,
                          studentIds: selectedLearningCvIds,
                          autoAddFromDate: courseForm.autoAddFromDate || deleteField(),
                        });
                        setChromeAlert("Đã cập nhật khóa học!");
                      } else {
                        await addDoc(collection(db, "courses"), {
                          name: courseForm.name,
                          startDate: courseForm.start,
                          endDate: courseForm.end,
                          closingDate: courseForm.closingDate,
                          studentIds: selectedLearningCvIds,
                          createdAt: serverTimestamp(),
                          autoAddFromDate: courseForm.autoAddFromDate || null,
                        });
                        setChromeAlert(
                          `Đã tạo khóa học với ${selectedLearningCvIds.length} học viên thành công!`,
                        );
                      }
                      setShowCreateCourseModal(false);
                      setSelectedLearningCvIds([]);
                      setCourseForm({
                        name: "",
                        start: "",
                        end: "",
                        closingDate: "",
                        autoAddFromDate: "",
                      });
                      setEditingCourseId(null);
                    } catch (e) {
                      handleFirestoreError(e, "create", "courses");
                    }
                  }}
                  className="px-8 py-3 bg-purple-600 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200"
                >
                  {editingCourseId ? "Lưu chỉnh sửa" : "Hoàn tất tạo khóa học"}
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
                <h2 className="text-sm font-black uppercase tracking-widest text-slate-900">
                  Đăng Nhập Admin
                </h2>
                <button
                  onClick={() => setShowLoginModal(false)}
                  className="text-slate-300 hover:text-yellow-600 transition-colors"
                >
                  <LogOut size={18} />
                </button>
              </div>

              <form onSubmit={handleSimpleLogin} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                      Username
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="admin"
                      value={adminLogin.user}
                      onChange={(e) =>
                        setAdminLogin({ ...adminLogin, user: e.target.value })
                      }
                      className="w-full p-4 bg-yellow-50/50 border border-transparent rounded-2xl text-sm outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white transition-all font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                      Mật khẩu
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••"
                      value={adminLogin.pass}
                      onChange={(e) =>
                        setAdminLogin({ ...adminLogin, pass: e.target.value })
                      }
                      className="w-full p-4 bg-yellow-50/50 border border-transparent rounded-2xl text-sm outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white transition-all font-bold"
                    />
                  </div>
                </div>

                <div className="p-3 bg-yellow-50 border border-yellow-100 rounded-xl text-[10px] text-yellow-700 font-medium leading-relaxed">
                  Lưu ý: Đây là tài khoản quản trị hệ thống. Hãy bảo mật thông
                  tin này.
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

      <AnimatePresence>
        {confirmDialog.show && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={confirmDialog.onCancel}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative z-10 p-6 border border-slate-100"
            >
              <h3 className="text-lg font-bold text-slate-800 mb-2">
                Thông báo
              </h3>
              <p className="text-sm text-slate-600 mb-8">
                {confirmDialog.message}
              </p>

              <div className="flex justify-end gap-3">
                <button
                  onClick={confirmDialog.onCancel}
                  className="px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDialog.onConfirm}
                  className="px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 text-white hover:bg-purple-700 shadow-md shadow-purple-200 transition-colors"
                >
                  OK
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {passwordPromptDialog.show && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={passwordPromptDialog.onCancel}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative z-10 p-6 border border-slate-100"
            >
              <h3 className="text-xl font-black text-slate-800 mb-2 font-display tracking-tight text-center">
                XÁC THỰC BẢO MẬT
              </h3>
              <p className="text-xs text-slate-500 font-medium mb-6 text-center">
                {passwordPromptDialog.message}
              </p>

              <div className="space-y-4">
                <input
                  type="password"
                  placeholder="Nhập mật khẩu..."
                  autoFocus
                  value={passwordPromptInput}
                  onChange={(e) => setPasswordPromptInput(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    passwordPromptDialog.onConfirm(passwordPromptInput)
                  }
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 focus:border-blue-400 outline-none rounded-2xl font-bold text-slate-800 text-center tracking-[0.25em] shadow-inner transition-all"
                />

                <div className="flex justify-end gap-3 mt-4">
                  <button
                    onClick={passwordPromptDialog.onCancel}
                    className="flex-1 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    HỦY
                  </button>
                  <button
                    onClick={() =>
                      passwordPromptDialog.onConfirm(passwordPromptInput)
                    }
                    className="flex-1 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-slate-900 text-white hover:bg-black shadow-lg shadow-slate-900/20 transition-all active:scale-[0.98]"
                  >
                    XÁC NHẬN
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="max-w-7xl mx-auto p-12 mt-12 border-t border-yellow-200">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          <p>© 2026 Admin Panel Schedlr</p>
          <div className="flex gap-8">
            <a href="#" className="hover:text-yellow-600 transition-colors">
              Bảo mật
            </a>
            <a href="#" className="hover:text-yellow-600 transition-colors">
              Điều khoản
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
