export const formatSum = (val?: number | string): string => {
  if (val === undefined || val === null) return '0';
  const num = typeof val === 'string' ? parseInt(val.replace(/[^0-9]/g, ''), 10) || 0 : val;
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

export const formatMoney = (val?: number | string): string => {
  return `${formatSum(val)} so'm`;
};
