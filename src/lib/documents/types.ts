/**
 * The built-in document types (pure). Every label carries both languages: the
 * printed paper uses the document's language, the editor uses the reader's.
 * Companies adjust these per type later (labels, hidden fields, extra fields).
 */

export type L = { en: string; ar: string };

/** Where a field's starting value comes from when a document is created from a project. */
export type Prefill = "client" | "project" | "today" | "budget" | "projectStart" | "projectEnd" | "manager";

export type FieldDef = {
  key: string;
  label: L;
  kind: "text" | "textarea" | "date" | "money" | "select";
  required?: boolean;
  /** Takes half the width in the editor and on paper. */
  half?: boolean;
  options?: { value: string; label: L }[];
  prefill?: Prefill;
  /** Default text for a new document. */
  defaultText?: L;
};

export type DocTypeDef = {
  key: DocTypeKey;
  prefix: string;
  /** lucide icon name, picked in the UI. */
  icon: "FileSignature" | "ShoppingCart" | "PackageCheck" | "Banknote" | "Mail" | "BadgeCheck" | "ClipboardList" | "FileText" | "Receipt";
  title: L;
  /** One line in the "New document" picker. */
  description: L;
  fields: FieldDef[];
  /** Line items table: with prices (and totals), or a goods list with a condition column. */
  items: null | { prices: boolean; condition?: boolean };
  /** Which amount is spelled out in words: the items total, or a money field. */
  words: null | "total" | string;
  signatures: L[];
  /** Which signature box gets the company's stamp. */
  stampOn: number;
};

export const DOC_TYPE_KEYS = [
  "contract",
  "purchase_order",
  "goods_received",
  "payment_voucher",
  "letter",
  "handover",
  "work_order",
  "quotation",
  "invoice",
] as const;
export type DocTypeKey = (typeof DOC_TYPE_KEYS)[number];

const f = (key: string, en: string, ar: string, kind: FieldDef["kind"], more: Partial<FieldDef> = {}): FieldDef => ({
  key,
  label: { en, ar },
  kind,
  ...more,
});

export const DOC_TYPES: DocTypeDef[] = [
  {
    key: "contract",
    prefix: "CT",
    icon: "FileSignature",
    title: { en: "Contract", ar: "عقد" },
    description: { en: "With a client or a subcontractor: parties, scope, price, terms.", ar: "مع عميل أو مقاول فرعي: الأطراف، النطاق، السعر، الشروط." },
    fields: [
      f("secondParty", "Second party", "الطرف الثاني", "text", { required: true, prefill: "client" }),
      f("secondPartyDetails", "Address, ID and representative", "العنوان والهوية والممثل", "textarea"),
      f("subject", "Subject of the contract", "موضوع العقد", "text", { required: true, prefill: "project" }),
      f("scope", "Scope of work", "نطاق العمل", "textarea", { required: true }),
      f("startDate", "Start date", "تاريخ البدء", "date", { half: true, prefill: "projectStart" }),
      f("endDate", "End date", "تاريخ الانتهاء", "date", { half: true, prefill: "projectEnd" }),
      f("value", "Contract value", "قيمة العقد", "money", { required: true, half: true, prefill: "budget" }),
      f("paymentTerms", "Payment terms", "شروط الدفع", "textarea", {
        defaultText: { en: "30% advance on signing, the rest in monthly payments against approved progress.", ar: "دفعة مقدمة 30% عند التوقيع، والباقي دفعات شهرية حسب نسب الإنجاز المعتمدة." },
      }),
      f("terms", "General terms", "الشروط العامة", "textarea", {
        defaultText: {
          en: "1. The second party carries out the work to the agreed specifications and safety rules.\n2. Any change to the scope must be agreed in writing by both parties.\n3. Disputes are settled amicably, otherwise by the competent courts.",
          ar: "1. يلتزم الطرف الثاني بتنفيذ الأعمال وفق المواصفات المتفق عليها وقواعد السلامة.\n2. أي تغيير في نطاق العمل يتم باتفاق خطي بين الطرفين.\n3. تُحل النزاعات وديًا، وإلا فأمام المحاكم المختصة.",
        },
      }),
    ],
    items: null,
    words: "value",
    signatures: [
      { en: "First party", ar: "الطرف الأول" },
      { en: "Second party", ar: "الطرف الثاني" },
    ],
    stampOn: 0,
  },
  {
    key: "purchase_order",
    prefix: "PO",
    icon: "ShoppingCart",
    title: { en: "Purchase order", ar: "أمر شراء" },
    description: { en: "Order materials from a supplier, with prices and delivery.", ar: "طلب مواد من مورّد، مع الأسعار والتسليم." },
    fields: [
      f("supplier", "Supplier", "المورّد", "text", { required: true }),
      f("supplierContact", "Supplier phone / contact", "هاتف المورّد / جهة الاتصال", "text"),
      f("deliveryDate", "Delivery date", "تاريخ التسليم", "date", { half: true }),
      f("deliveryPlace", "Deliver to", "مكان التسليم", "text", { half: true, prefill: "project" }),
      f("paymentTerms", "Payment terms", "شروط الدفع", "textarea", {
        defaultText: { en: "Payment within 30 days of delivery and invoice.", ar: "الدفع خلال 30 يومًا من التسليم واستلام الفاتورة." },
      }),
    ],
    items: { prices: true },
    words: "total",
    signatures: [
      { en: "Prepared by", ar: "أعدّه" },
      { en: "Approved by", ar: "اعتمده" },
      { en: "Supplier", ar: "المورّد" },
    ],
    stampOn: 1,
  },
  {
    key: "goods_received",
    prefix: "GRN",
    icon: "PackageCheck",
    title: { en: "Goods received note", ar: "مذكرة استلام مواد" },
    description: { en: "Materials delivered to site or store: what arrived and in what condition.", ar: "مواد وصلت إلى الموقع أو المخزن: ما وصل وحالته." },
    fields: [
      f("supplier", "Received from", "مستلم من", "text", { required: true }),
      f("reference", "Delivery note no.", "رقم وصل التسليم", "text", { half: true }),
      f("location", "Received at", "مكان الاستلام", "text", { half: true, prefill: "project" }),
      f("notes", "Notes", "ملاحظات", "textarea"),
    ],
    items: { prices: false, condition: true },
    words: null,
    signatures: [
      { en: "Delivered by", ar: "المسلِّم" },
      { en: "Received by", ar: "المستلِم" },
      { en: "Store keeper", ar: "أمين المخزن" },
    ],
    stampOn: 2,
  },
  {
    key: "payment_voucher",
    prefix: "PV",
    icon: "Banknote",
    title: { en: "Payment voucher", ar: "سند صرف" },
    description: { en: "Money paid out: to whom, how much, how and what for.", ar: "مبلغ مصروف: لمن، وكم، وكيف، ولماذا." },
    fields: [
      f("paidTo", "Paid to", "صُرف إلى", "text", { required: true }),
      f("amount", "Amount", "المبلغ", "money", { required: true, half: true }),
      f("method", "Payment method", "طريقة الدفع", "select", {
        half: true,
        options: [
          { value: "cash", label: { en: "Cash", ar: "نقدًا" } },
          { value: "bank", label: { en: "Bank transfer", ar: "حوالة مصرفية" } },
          { value: "cheque", label: { en: "Cheque", ar: "صك" } },
        ],
      }),
      f("reference", "Cheque / transfer no.", "رقم الصك / الحوالة", "text", { half: true }),
      f("purpose", "For", "وذلك عن", "textarea", { required: true }),
    ],
    items: null,
    words: "amount",
    signatures: [
      { en: "Prepared by", ar: "المحاسب" },
      { en: "Approved by", ar: "المدير" },
      { en: "Received by", ar: "المستلم" },
    ],
    stampOn: 1,
  },
  {
    key: "letter",
    prefix: "LT",
    icon: "Mail",
    title: { en: "Official letter", ar: "خطاب رسمي" },
    description: { en: "A formal letter on letterhead: permit requests, notices, replies.", ar: "خطاب رسمي على الترويسة: طلبات تراخيص، إشعارات، ردود." },
    fields: [
      f("to", "To", "إلى", "text", { required: true }),
      f("toDetails", "Address", "العنوان", "textarea"),
      f("subject", "Subject", "الموضوع", "text", { required: true }),
      f("body", "Letter", "نص الخطاب", "textarea", {
        required: true,
        defaultText: { en: "Dear Sir / Madam,\n\n\n\nYours faithfully,", ar: "تحية طيبة وبعد،\n\n\n\nمع فائق الاحترام والتقدير." },
      }),
    ],
    items: null,
    words: null,
    signatures: [{ en: "Signature", ar: "التوقيع" }],
    stampOn: 0,
  },
  {
    key: "handover",
    prefix: "HC",
    icon: "BadgeCheck",
    title: { en: "Handover certificate", ar: "محضر استلام وتسليم" },
    description: { en: "Hand finished work over to the client, with any items still to do.", ar: "تسليم الأعمال المنجزة إلى العميل، مع أي أعمال متبقية." },
    fields: [
      f("client", "Handed over to", "المستلم", "text", { required: true, prefill: "client" }),
      f("works", "Works handed over", "الأعمال المسلّمة", "textarea", { required: true, prefill: "project" }),
      f("remarks", "Remarks / outstanding items", "الملاحظات / الأعمال المتبقية", "textarea"),
      f("warranty", "Warranty / maintenance period", "فترة الضمان / الصيانة", "text", { half: true }),
    ],
    items: null,
    words: null,
    signatures: [
      { en: "Contractor", ar: "المقاول" },
      { en: "Client", ar: "العميل" },
      { en: "Consultant", ar: "الاستشاري" },
    ],
    stampOn: 0,
  },
  {
    key: "work_order",
    prefix: "WO",
    icon: "ClipboardList",
    title: { en: "Work order", ar: "أمر عمل" },
    description: { en: "An instruction to a team or subcontractor: what, where, by when.", ar: "تعليمات لفريق أو مقاول فرعي: ماذا، وأين، ومتى." },
    fields: [
      f("to", "To (team / subcontractor)", "إلى (الفريق / المقاول الفرعي)", "text", { required: true }),
      f("location", "Location", "الموقع", "text", { half: true, prefill: "project" }),
      f("priority", "Priority", "الأولوية", "select", {
        half: true,
        options: [
          { value: "normal", label: { en: "Normal", ar: "عادية" } },
          { value: "urgent", label: { en: "Urgent", ar: "عاجلة" } },
        ],
      }),
      f("startDate", "Start", "البدء", "date", { half: true, prefill: "today" }),
      f("dueDate", "Finish by", "الإنجاز قبل", "date", { half: true }),
      f("instructions", "Instructions", "التعليمات", "textarea", { required: true }),
    ],
    items: null,
    words: null,
    signatures: [
      { en: "Issued by", ar: "أصدره" },
      { en: "Received by", ar: "استلمه" },
    ],
    stampOn: 0,
  },
  {
    key: "quotation",
    prefix: "QT",
    icon: "FileText",
    title: { en: "Quotation", ar: "عرض سعر" },
    description: { en: "A price offer to a client, with items and totals.", ar: "عرض سعر لعميل، مع البنود والمجاميع." },
    fields: [
      f("client", "To", "إلى", "text", { required: true, prefill: "client" }),
      f("subject", "Subject", "الموضوع", "text", { prefill: "project" }),
      f("validUntil", "Valid until", "صالح حتى", "date", { half: true }),
      f("terms", "Terms", "الشروط", "textarea", {
        defaultText: { en: "Prices are valid until the date above. Delivery within 14 days of order.", ar: "الأسعار سارية حتى التاريخ المذكور أعلاه. التسليم خلال 14 يومًا من الطلب." },
      }),
    ],
    items: { prices: true },
    words: "total",
    signatures: [{ en: "For the company", ar: "عن الشركة" }],
    stampOn: 0,
  },
  {
    key: "invoice",
    prefix: "INV",
    icon: "Receipt",
    title: { en: "Invoice", ar: "فاتورة" },
    description: { en: "A bill to a client: items, tax, total and how to pay.", ar: "فاتورة لعميل: البنود، الضريبة، المجموع، وطريقة الدفع." },
    fields: [
      f("client", "Bill to", "فاتورة إلى", "text", { required: true, prefill: "client" }),
      f("subject", "Subject", "الموضوع", "text", { prefill: "project" }),
      f("dueDate", "Due date", "تاريخ الاستحقاق", "date", { half: true }),
      f("paymentDetails", "Payment details (bank account)", "تفاصيل الدفع (الحساب المصرفي)", "textarea"),
    ],
    items: { prices: true },
    words: "total",
    signatures: [{ en: "For the company", ar: "عن الشركة" }],
    stampOn: 0,
  },
];

export const docType = (key: string) => DOC_TYPES.find((d) => d.key === key);
export const isDocType = (v: unknown): v is DocTypeKey => DOC_TYPE_KEYS.includes(v as DocTypeKey);

/** "PO-0007" */
export const docNumber = (prefix: string, n: number) => `${prefix}-${String(n).padStart(4, "0")}`;

export const DOC_STATUSES = [
  { value: "draft", label: { en: "Draft", ar: "مسودة" } },
  { value: "issued", label: { en: "Issued", ar: "صادر" } },
  { value: "signed", label: { en: "Signed", ar: "موقّع" } },
  { value: "cancelled", label: { en: "Cancelled", ar: "ملغى" } },
] as const;
export type DocStatus = (typeof DOC_STATUSES)[number]["value"];

/** Words printed on every document, in its language. */
export const DOC_LABELS = {
  en: { number: "No.", date: "Date", project: "Project", item: "Description", unit: "Unit", qty: "Qty", price: "Unit price", amount: "Amount", condition: "Condition", subtotal: "Subtotal", tax: "Tax", total: "Total", inWords: "Amount in words", name: "Name", signature: "Signature", page: "Page" },
  ar: { number: "الرقم", date: "التاريخ", project: "المشروع", item: "البيان", unit: "الوحدة", qty: "الكمية", price: "سعر الوحدة", amount: "المبلغ", condition: "الحالة", subtotal: "المجموع الفرعي", tax: "الضريبة", total: "المجموع", inWords: "المبلغ كتابةً", name: "الاسم", signature: "التوقيع", page: "صفحة" },
} as const;

export type DocItem = { description: string; unit: string; quantity: string; unitPrice: string; condition?: string };

const cents = (v: string | number) => Math.round(Number(v || 0) * 100);

/** Line totals, subtotal, tax and total (2 decimals, no float drift). */
export function docTotals(items: DocItem[], taxRate: string | number | null) {
  const lines = items.map((i) => Math.round(Number(i.quantity || 0) * cents(i.unitPrice)));
  const subtotal = lines.reduce((s, c) => s + c, 0);
  const tax = Math.round((subtotal * Number(taxRate || 0)) / 100);
  return {
    lines: lines.map((c) => c / 100),
    subtotal: subtotal / 100,
    tax: tax / 100,
    total: (subtotal + tax) / 100,
  };
}
