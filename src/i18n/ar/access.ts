import type { Dictionary } from "../translate";

/** Project teams, member permissions and blocked tasks (Phase 17). */
export default {
  "You're not on any project yet": "لست ضمن أي مشروع بعد",
  "Projects appear here when a project manager adds you to the team or assigns you a task.":
    "تظهر المشاريع هنا عندما يضيفك مدير المشروع إلى الفريق أو يسند إليك مهمة.",
  "Project team": "فريق المشروع",
  "Members only see the projects they're on. Assigning someone a task adds them automatically. Owners and admins see every project.":
    "يرى الأعضاء المشاريع التي هم ضمن فريقها فقط. إسناد مهمة لشخص يضيفه إلى الفريق تلقائيًا. المالكون والمسؤولون يرون كل المشاريع.",
  "Nobody on the team yet.": "لا أحد في الفريق بعد.",
  "Confirm removing {name} from the team": "تأكيد إزالة {name} من الفريق",
  "Remove {name} from the team": "إزالة {name} من الفريق",
  "{name} removed from the team": "أُزيل {name} من الفريق",
  "Remove from team": "إزالة من الفريق",
  "{name} added to the team": "أُضيف {name} إلى الفريق",
  "Add to the team": "إضافة إلى الفريق",
  "Choose a member…": "اختر عضوًا…",
  "Project manager": "مدير المشروع",
  "Blocked by {count} unfinished tasks.": {
    one: "متوقفة على مهمة واحدة لم تنتهِ.",
    two: "متوقفة على مهمتين لم تنتهيا.",
    few: "متوقفة على {count} مهام لم تنتهِ.",
    many: "متوقفة على {count} مهمة لم تنتهِ.",
    other: "متوقفة على {count} مهمة لم تنتهِ.",
  },
  "It can't be started, updated or finished until {titles} is finished.":
    "لا يمكن بدؤها أو تحديثها أو إنهاؤها حتى تنتهي {titles}.",
  "It can't be started, updated or finished until {titles} are finished.":
    "لا يمكن بدؤها أو تحديثها أو إنهاؤها حتى تنتهي {titles}.",
  "You can still plan it (dates, assignee, weight, priority).": "ما زال بإمكانك تخطيطها (التواريخ، المكلَّف، الوزن، الأولوية).",
  "You can still comment.": "ما زال بإمكانك التعليق.",
  "View only.": "للعرض فقط.",
  "Only {name} (assigned) or the project manager can update this task.":
    "فقط {name} (المكلَّف بها) أو مدير المشروع يمكنهم تحديث هذه المهمة.",
  "Only the project manager can update this task.": "فقط مدير المشروع يمكنه تحديث هذه المهمة.",
  "You can update the status, progress and sub-tasks.": "يمكنك تحديث الحالة ونسبة الإنجاز والمهام الفرعية.",
  "Dates, weight and the other details are set by the project manager.": "التواريخ والوزن وباقي التفاصيل يحددها مدير المشروع.",
  "No description.": "لا يوجد وصف.",
  "Only the project manager or admins can change the team.": "مدير المشروع أو المسؤولون فقط يمكنهم تعديل الفريق.",
  "That person isn't a member of this workspace.": "هذا الشخص ليس عضوًا في مساحة العمل.",
  "The project manager is always on the team. Change the manager first.": "مدير المشروع ضمن الفريق دائمًا. غيّر المدير أولًا.",
  "Only workspace owners and admins can create projects.": "المالكون والمسؤولون فقط يمكنهم إنشاء المشاريع.",
  "Only the project manager or admins can add tasks.": "مدير المشروع أو المسؤولون فقط يمكنهم إضافة المهام.",
  "Only the project manager or admins can change this.": "مدير المشروع أو المسؤولون فقط يمكنهم تغيير هذا.",
  "You can only update tasks assigned to you.": "يمكنك تحديث المهام المسندة إليك فقط.",
  "Blocked until {titles} is finished.": "متوقفة حتى تنتهي {titles}.",
  "Blocked until {titles} are finished.": "متوقفة حتى تنتهي {titles}.",
  "added {name} to the project team": "أضاف {name} إلى فريق المشروع",
  "removed {name} from the project team": "أزال {name} من فريق المشروع",
  "{ref} is blocked by unfinished tasks, so it wasn't moved.": "{ref} متوقفة على مهام لم تنتهِ، لذا لم تُنقل.",
  "Only workspace owners and admins can change the resource library.": "المالكون والمسؤولون فقط يمكنهم تعديل مكتبة الموارد.",
  "Only the project manager or admins can change this project's resources.": "مدير المشروع أو المسؤولون فقط يمكنهم تعديل موارد هذا المشروع.",
} satisfies Dictionary;
