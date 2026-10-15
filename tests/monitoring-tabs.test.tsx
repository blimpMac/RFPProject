import { render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { MonitoringPage } from '../src/pages/MonitoringPage';
import { get } from '../src/lib/api';

vi.mock('../src/lib/api',()=>({get:vi.fn()}));
vi.mock('../src/components/AuthProvider',()=>({useAuth:()=>({roles:['administrator']})}));

describe('monitoring worksheets',()=>{
  beforeEach(()=>vi.mocked(get).mockResolvedValue({rows:[],count:0,page:1,pageSize:50}));
  it('does not expose the removed Recommended Process Flow worksheet',async()=>{
    render(<MonitoringPage/>);
    await waitFor(()=>expect(get).toHaveBeenCalledWith('monitoring/requests?page=1&pageSize=50'));
    expect(screen.getByRole('button',{name:'RFP Tracker'})).toBeInTheDocument();
    expect(screen.queryByText('Recommended Process Flow')).not.toBeInTheDocument();
  });
});
