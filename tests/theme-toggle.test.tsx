import { fireEvent,render,screen } from '@testing-library/react';
import { beforeEach,describe,expect,it } from 'vitest';
import { ThemeToggle } from '../src/components/ThemeToggle';

describe('dark mode',()=>{
  beforeEach(()=>{localStorage.clear();document.documentElement.className='';delete document.documentElement.dataset.theme});
  it('persists the selected theme and exposes an accessible control',()=>{
    render(<ThemeToggle/>);
    const toggle=screen.getByRole('button',{name:'Switch to dark mode'});
    fireEvent.click(toggle);
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('rfp-theme')).toBe('dark');
    expect(screen.getByRole('button',{name:'Switch to light mode'})).toHaveAttribute('aria-pressed','true');
  });
});
