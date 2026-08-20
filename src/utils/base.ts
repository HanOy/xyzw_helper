import moment from 'moment';

export const isInCurrentWeek = (timestamp: number, weekStart = 1): boolean => {
  moment.locale('zh-cn', {
    week: {
      dow: weekStart,
      doy: 4,
    },
  });
  const t = moment(timestamp);
  const today = moment();
  return t.isSame(today, 'week');
};

export const randInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));