const FRIDAY_DAY = 5;
const DAYS_PER_WEEK = 7;

const getCycleFriday = (date: Date): Date => {
  const cycleDate = new Date(date);
  const diff = (cycleDate.getDay() - FRIDAY_DAY + DAYS_PER_WEEK) % DAYS_PER_WEEK;

  cycleDate.setHours(0, 0, 0, 0);
  cycleDate.setDate(cycleDate.getDate() - diff);

  return cycleDate;
};

export const getTowerActId = (date: Date = new Date()): number => {
  const cycleFriday = getCycleFriday(date);
  const year = String(cycleFriday.getFullYear()).slice(-2);
  const month = String(cycleFriday.getMonth() + 1).padStart(2, "0");
  const day = String(cycleFriday.getDate()).padStart(2, "0");

  return Number(`${year}${month}${day}1`);
};
