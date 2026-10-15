import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe,expect,it,vi } from 'vitest';

const {resetPasswordForEmail}=vi.hoisted(()=>({resetPasswordForEmail:vi.fn().mockResolvedValue({error:null})}));
vi.mock('../src/lib/supabase',()=>({supabase:{auth:{resetPasswordForEmail}}}));
import { PasswordRecoveryPage } from '../src/pages/PasswordRecoveryPage';

describe('password recovery',()=>{
  it('sends a recovery link to the public reset-password route',async()=>{
    render(<MemoryRouter><PasswordRecoveryPage/></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Email'),{target:{value:'approver@example.com'}});
    fireEvent.click(screen.getByRole('button',{name:'Send reset link'}));
    await waitFor(()=>expect(resetPasswordForEmail).toHaveBeenCalledWith('approver@example.com',{redirectTo:`${window.location.origin}/admin/reset-password`}));
    expect(await screen.findByText(/reset link has been sent/i)).toBeVisible();
  });
});
