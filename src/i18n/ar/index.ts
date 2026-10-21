import type { Dictionary } from "../translate";
import common from "./common";
import shell from "./shell";
import auth from "./auth";
import tasks from "./tasks";
import projects from "./projects";
import money from "./money";
import server from "./server";
import access from "./access";
import loans from "./loans";
import risks from "./risks";
import forecast from "./forecast";
import time from "./time";

/**
 * Arabic dictionary, keyed by the English text. Split by area so several
 * people can work on it at once; a missing entry falls back to English.
 * Later areas win when the same English text appears twice.
 */
export const ar: Dictionary = {
  ...server,
  ...common,
  ...shell,
  ...auth,
  ...tasks,
  ...projects,
  ...money,
  ...access,
  ...loans,
  ...risks,
  ...forecast,
  ...time,
};
