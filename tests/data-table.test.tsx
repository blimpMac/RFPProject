import { fireEvent,render,screen } from '@testing-library/react';
import { describe,expect,it } from 'vitest';
import { DataTable } from '../src/components/DataTable';
describe('monitoring table filtering',()=>{it('filters the current worksheet rows',()=>{render(<DataTable rows={[{rfp_number:'RFP-0001',department:'Finance'},{rfp_number:'RFP-0002',department:'Operations'}]} total={2} page={1} pageSize={25} onPage={()=>{}} onPageSize={()=>{}} defaultKeys={['rfp_number','department']} title="RFP Tracker"/>);fireEvent.change(screen.getByPlaceholderText('Search visible rows…'),{target:{value:'Finance'}});expect(screen.getByText('RFP-0001')).toBeInTheDocument();expect(screen.queryByText('RFP-0002')).not.toBeInTheDocument()})});
