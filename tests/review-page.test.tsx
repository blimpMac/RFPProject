import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ReviewPage } from '../src/pages/ReviewPage';
import { api } from '../src/lib/api';

vi.mock('../src/lib/api', () => ({ api: vi.fn() }));

describe('secure review attachments', () => {
  it('renders image attachments from their signed preview URL', async () => {
    vi.mocked(api).mockResolvedValue({
      request: {
        id: 'request-id',
        rfp_number: 'RFP-0006',
        requestor_name: 'Drician Francisco Cordon',
        requestor_email: 'dricianfranciscordon@gmail.com',
        department: 'Other',
        project_class: 'Attachment Preview Test',
        rfp_type: 'Request for Payment',
        supplier_payee: 'TEST ONLY',
        purpose_description: 'Preview test only.',
        amount: 1,
        required_payment_date: '2026-10-22',
        final_status: 'Pending Department Approval',
      },
      attachments: [{
        id: 'attachment-id',
        original_filename: 'rfp-attachment-preview-test.png',
        mime_type: 'image/png',
        url: 'https://storage.example.test/signed-preview',
      }],
    });

    render(
      <MemoryRouter initialEntries={['/review/test-token']}>
        <Routes><Route path="/review/:token" element={<ReviewPage />} /></Routes>
      </MemoryRouter>,
    );

    const preview = await screen.findByRole('img', { name: 'rfp-attachment-preview-test.png' });
    expect(preview).toHaveAttribute('src', 'https://storage.example.test/signed-preview');
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', 'https://storage.example.test/signed-preview');
  });
});
