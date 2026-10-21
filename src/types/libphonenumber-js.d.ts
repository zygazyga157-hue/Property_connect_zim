declare module "libphonenumber-js/min" {
  type ParsedPhoneNumber = { isValid(): boolean };
  export function parsePhoneNumberFromString(value: string): ParsedPhoneNumber | undefined;
}
