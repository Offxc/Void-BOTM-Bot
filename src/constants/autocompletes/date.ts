import { parseDate } from "chrono-node";
import { relativeTime } from "human-date";
import type { Autocomplete } from "../../handlers/interactions/autocompletes";

const dateAutocomplete: Autocomplete<string> = query => {
  const date = parseContestDate(query);
  if (!date) {
    return [{ name: "Invalid date", value: "0" }];
  }

  return [{ name: `${date.toString()} (${relativeTime(date)})`, value: String(date.getTime()) }];
};

export default dateAutocomplete;

export function parseContestDate(input: string): null | Date {
  const trimmed = input.trim();
  if (/^\d{10,13}$/.test(trimmed)) {
    const numeric = Number(trimmed);
    const millis = trimmed.length === 10 ? numeric * 1000 : numeric;
    const date = new Date(millis);
    if (!Number.isNaN(date.getTime())) return date;
  }

  return parseDayFirstDate(trimmed) ?? parseDate(trimmed, new Date(), { forwardDate: true });
}

function parseDayFirstDate(input: string): null | Date {
  const trimmed = input.trim();
  const match = trimmed.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?(?:\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(am|pm)?)?$/i);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(day) || !Number.isInteger(month) || day < 1 || month < 1 || month > 12) return null;

  const now = new Date();
  let year = match[3] ? Number(match[3]) : now.getFullYear();
  if (!Number.isInteger(year)) return null;
  if (year < 100) year += 2000;

  const hasTime = Boolean(match[4]);
  let hours = match[4] ? Number(match[4]) : 0;
  let minutes = match[5] ? Number(match[5]) : 0;
  let seconds = match[6] ? Number(match[6]) : 0;
  const meridiem = match[7]?.toLowerCase();

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === "am") {
      hours = hours === 12 ? 0 : hours;
    } else if (meridiem === "pm") {
      hours = hours === 12 ? 12 : hours + 12;
    }
  } else if (hours < 0 || hours > 23) {
    return null;
  }

  if (minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null;

  const candidate = new Date(year, month - 1, day, hours, minutes, seconds);
  if (candidate.getFullYear() !== year || candidate.getMonth() !== month - 1 || candidate.getDate() !== day) {
    return null;
  }

  if (!match[3]) {
    if (hasTime) {
      if (candidate.getTime() < now.getTime()) {
        candidate.setFullYear(candidate.getFullYear() + 1);
      }
    } else {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const candidateDate = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate());
      if (candidateDate < today) {
        candidate.setFullYear(candidate.getFullYear() + 1);
      }
    }
  }

  return candidate;
}
