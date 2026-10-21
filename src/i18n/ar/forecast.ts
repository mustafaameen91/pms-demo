import type { Dictionary } from "../translate";

/** Cost forecast (Phase 19). */
export default {
  "Cost forecast": "توقّع الكلفة",
  "Expected final cost": "الكلفة النهائية المتوقعة",
  "Final cost": "الكلفة النهائية",
  "No forecast yet. It starts once some of the work is done.": "لا يوجد توقّع بعد. يبدأ عند إنجاز جزء من العمل.",
  "No forecast yet. Nothing has been spent so far.": "لا يوجد توقّع بعد. لم يُصرف شيء حتى الآن.",
  "Heading {amount} over budget ({pct}%)": "متجه لتجاوز الميزانية بـ {amount} ({pct}%)",
  "Heading {amount} under budget": "متجه لتوفير {amount} من الميزانية",
  "Heading for the budget": "متجه للالتزام بالميزانية",
  "Finished {amount} over budget": "انتهى متجاوزًا الميزانية بـ {amount}",
  "Finished within budget": "انتهى ضمن الميزانية",
  "{spent}% of the budget spent for {done}% of the work.": "صُرف {spent}% من الميزانية مقابل إنجاز {done}% من العمل.",
  "Based on {done}% of the work done.": "بناءً على إنجاز {done}% من العمل.",
  "Spending is running ahead of progress.": "الصرف أسرع من التقدم في العمل.",
  "Spending is in step with progress.": "الصرف متناسب مع التقدم في العمل.",
  "About {amount} still to spend.": "يتبقى صرف نحو {amount}.",
  "Work is moving at {pct}% of the planned pace.": "العمل يسير بنسبة {pct}% من الوتيرة المخططة.",
  "Work is keeping up with the plan.": "العمل يواكب الخطة.",
  "Early estimate: less than 10% of the work is done, so it can still change a lot.":
    "تقدير مبكر: أُنجز أقل من 10% من العمل، لذا قد يتغير كثيرًا.",
  "Expected final cost = spent ÷ % of work done.": "الكلفة النهائية المتوقعة = المصروف ÷ نسبة العمل المنجز.",
  "Heading {pct}% over budget": "متجه لتجاوز الميزانية بـ {pct}%",
  "Spent more than budget · {count} more heading over": {
    one: "المصروف أكبر من الميزانية · ومشروع آخر متجه للتجاوز",
    two: "المصروف أكبر من الميزانية · ومشروعان آخران متجهان للتجاوز",
    few: "المصروف أكبر من الميزانية · و{count} مشاريع أخرى متجهة للتجاوز",
    many: "المصروف أكبر من الميزانية · و{count} مشروعًا آخر متجهًا للتجاوز",
    other: "المصروف أكبر من الميزانية · و{count} مشروع آخر متجه للتجاوز",
  },
  "Not enough data yet": "لا توجد بيانات كافية بعد",
  "Expected over (+) / under (−) budget": "التجاوز المتوقع (+) / الوفر (−) عن الميزانية",
  "Cost efficiency (CPI)": "كفاءة الكلفة (CPI)",
  "Schedule efficiency (SPI)": "كفاءة الجدول (SPI)",
} satisfies Dictionary;
