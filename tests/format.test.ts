import { describe,expect,it } from 'vitest';
import { manilaDate,php,statusTone } from '../src/lib/format';
describe('presentation formatting',()=>{it('uses Philippine pesos',()=>expect(php.format(1299)).toMatch(/₱|PHP/));it('renders Manila calendar dates',()=>expect(manilaDate('2026-10-09T16:30:00Z')).toContain('Oct 10, 2026'));it('maps statuses to accessible color categories',()=>{expect(statusTone('Finance Rejected')).toBe('rejected');expect(statusTone('Approved for Payment')).toBe('approved');expect(statusTone('Pending Finance Review')).toBe('pending')})});
