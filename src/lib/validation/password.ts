export function getPasswordValidation(password: string) {
  return {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
}

export function isPasswordPolicySatisfied(password: string): boolean {
  return Object.values(getPasswordValidation(password)).every(Boolean);
}
