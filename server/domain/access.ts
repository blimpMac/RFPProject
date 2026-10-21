export const administrativeRoles:string[]=['super_administrator','administrator'];

export const protectedStaffEmails=new Set([
  'gpigemcorqbbackup@gmail.com',
  'dricianfranciscordon@gmail.com',
  'cerealman637@gmail.com',
]);

export function protectedAccountLabel(email:string|undefined){
  return email?'Signed-in protected inbox':'Signed-in staff inbox';
}
