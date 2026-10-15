import fs from 'node:fs';
import { describe,expect,it } from 'vitest';

describe('browser tab icon',()=>{
  it('uses a dedicated square, high-contrast Greenlight favicon',()=>{
    const html=fs.readFileSync('index.html','utf8');
    const icon=fs.readFileSync('public/favicon.svg','utf8');
    expect(html).toContain('href="/favicon.svg"');
    expect(html).not.toContain('rel="icon" type="image/png" href="/brands/greenlight-power.png"');
    expect(icon).toContain('viewBox="0 0 64 64"');
    expect(icon).toContain('#00c875');
    expect(icon).toContain('#102a43');
  });
});
