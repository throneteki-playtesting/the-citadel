export const px = (value: number) => `${value}px`;
export const em = (value: number) => `${value}em`;

export const BASE_WIDTH = 240;
export const BASE_HEIGHT = 333;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const divisor = gcd(BASE_WIDTH, BASE_HEIGHT);
export const ASPECT_RATIO = {
    width: BASE_WIDTH / divisor,
    height: BASE_HEIGHT / divisor
};
