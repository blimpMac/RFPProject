import assert from 'node:assert/strict';
import test from 'node:test';
import {
  profileEmailChangeOtpMessage,
  renderFinanceEmailChangeNotice,
  renderProfileEmailChangeOtp,
} from './profile-email-change.ts';

test('OTP email contains the code and clearly states the 10-minute expiry', () => {
  const rendered = renderProfileEmailChangeOtp('381942');
  assert.match(rendered.text, /381942/);
  assert.match(rendered.html, /381942/);
  assert.match(rendered.text, /10 minutes/);
});


test('email-change OTP is addressed only to the proposed new mailbox', () => {
  const target = 'dricianfranciscordon@gmail.com';
  const message = profileEmailChangeOtpMessage(target, '381942');
  assert.equal(message.to, target);
  assert.equal('cc' in message, false);
  assert.equal('bcc' in message, false);
  assert.match(message.text, /381942/);
});

test('Finance notification contains account event details but never the OTP', () => {
  const rendered = renderFinanceEmailChangeNotice({
    actorEmail: 'staff@example.com',
    maskedAddress: 'ne••••@example.com',
    event: 'verification_requested',
  });
  assert.match(rendered.text, /staff@example.com/);
  assert.match(rendered.text, /ne••••@example.com/);
  assert.match(rendered.text, /intentionally excluded/);
  assert.equal(rendered.text.includes('381942'), false);
  assert.equal(rendered.html.includes('381942'), false);
  assert.equal(rendered.html.includes('otp'), false);
});
