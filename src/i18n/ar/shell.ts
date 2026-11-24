import type { Dictionary } from "../translate";

/** Sidebar, top bar, subscription banner. */
export default {
  "Navigation": "التنقل",
  "Open navigation": "فتح القائمة",
  "Open navigation, {count} unread notifications": "فتح القائمة، {count} إشعارات غير مقروءة",
  "Main": "القائمة الرئيسية",
  "My tasks": "مهامي",
  "Inbox": "صندوق الوارد",
  "unread": "غير مقروءة",
  "Approvals": "الموافقات",
  "waiting": "بانتظار الموافقة",
  "Dashboard": "لوحة المتابعة",
  "Templates": "القوالب",
  "Workload": "عبء العمل",
  "Audit log": "سجل التدقيق",
  "Billing": "الاشتراك والدفع",
  "Platform admin": "إدارة المنصة",
  "Your projects": "مشاريعك",
  "New project": "مشروع جديد",
  "No projects yet.": "لا توجد مشاريع بعد.",
  "Create workspace": "إنشاء مساحة عمل",
  "Theme": "المظهر",
  "Light": "فاتح",
  "Dark": "داكن",
  "System": "حسب النظام",
  "Sign out": "تسجيل الخروج",
  "This workspace is waiting for payment. Projects open once the subscription is activated.":
    "مساحة العمل هذه بانتظار الدفع. ستُفتح المشاريع بمجرد تفعيل الاشتراك.",
  "The subscription has ended, so this workspace is locked. Your data is safe — renew to continue.":
    "انتهى الاشتراك، لذلك أُقفلت مساحة العمل. بياناتك محفوظة — جدّد الاشتراك للمتابعة.",
  "This workspace's subscription was cancelled.": "أُلغي اشتراك مساحة العمل هذه.",
  "Trial: {count} days left.": { zero: "الفترة التجريبية: تنتهي اليوم.", one: "الفترة التجريبية: بقي يوم واحد.", two: "الفترة التجريبية: بقي يومان.", few: "الفترة التجريبية: بقيت {count} أيام.", many: "الفترة التجريبية: بقي {count} يومًا.", other: "الفترة التجريبية: بقي {count} يوم." },
  "The subscription ends today.": "ينتهي الاشتراك اليوم.",
  "The subscription ends in {count} days.": { one: "ينتهي الاشتراك بعد يوم واحد.", two: "ينتهي الاشتراك بعد يومين.", few: "ينتهي الاشتراك بعد {count} أيام.", many: "ينتهي الاشتراك بعد {count} يومًا.", other: "ينتهي الاشتراك بعد {count} يوم." },
  "Billing & payment": "الاشتراك والدفع",
  "Renew": "تجديد",

  // Page headers and stat tiles (Projects, My tasks)
  "Active in {workspace}": "النشطة في {workspace}",
  "Done across projects with tasks": "المنجز في المشاريع التي لها مهام",
  "On or ahead of plan": "وفق الخطة أو متقدمة عليها",
  "Share of projects on track": "نسبة المشاريع التي تسير وفق الخطة",
  "Open tasks": "المهام المفتوحة",
  "Assigned to you": "المسندة إليك",
  "Share of my open tasks that are overdue": "نسبة مهامي المفتوحة المتأخرة",
  "Coming up this week": "القادمة هذا الأسبوع",

  // Sidebar sections
  "Work": "العمل",
  "Resources & money": "الموارد والأموال",
  "Company": "الشركة",

  // Members and Templates pages
  "In this workspace": "في مساحة العمل هذه",
  "Owners": "المالكون",
  "Admins": "المسؤولون",
  "Waiting to be accepted": "بانتظار القبول",
  "Members|role": "الأعضاء",
  "Saved from your projects": "محفوظة من مشاريعك",
  "Ready to use": "جاهزة للاستخدام",
  "Tasks inside": "المهام داخلها",
  "Across all templates": "في جميع القوالب",
  "Save a project as a template": "احفظ مشروعًا كقالب",
} satisfies Dictionary;
