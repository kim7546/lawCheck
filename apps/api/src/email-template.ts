const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
const lines = (value: string) => escapeHtml(value).replace(/\r?\n/g, '<br>');

export function renderReviewRequestEmail(text: string): string {
  const marker = '\n\nOffice에서 검증하기\n';
  const index = text.lastIndexOf(marker);
  const tail = index >= 0 ? text.slice(index + marker.length) : '';
  const candidate = tail.split('\n')[0]!;
  let link = '';
  try {
    const url = new URL(candidate);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password)
      link = url.href;
  } catch {
    // Preserve the complete text even if a stored snapshot has an invalid link.
  }
  const prefix = '검증을 원하는 질문이 등록되었습니다.\n\n질문\n';
  const content = link ? text.slice(text.startsWith(prefix) ? prefix.length : 0, index) : text;
  const answerMarker = '\n\nAI 답변\n';
  const answerIndex = link && text.startsWith(prefix) ? content.indexOf(answerMarker) : -1;
  const section = (label: string, value: string) =>
    `<tr><td style="padding:0 24px 24px"><div style="padding:22px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;font-size:15px;line-height:1.85;color:#25364d;overflow-wrap:anywhere;word-break:break-word"><h2 style="margin:0 0 12px;font-size:14px;color:#2563eb">${label}</h2>${lines(value)}</div></td></tr>`;
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AI QAVER 검증 요청 안내</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,'Malgun Gothic','Apple SD Gothic Neo',sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #e2e8f0;border-top:4px solid #2563eb;border-radius:16px">
<tr><td style="padding:24px;border-bottom:1px solid #eef2f7"><img src="https://search.aiqaver.com/brand/aiqaver-logo.png" width="180" alt="AI QAVER" style="display:block;width:180px;max-width:100%;height:auto;border:0"></td></tr>
<tr><td style="padding:30px 24px 20px"><p style="margin:0 0 12px;font-size:12px;color:#2563eb;font-weight:bold">REVIEW REQUEST</p>
<h1 style="margin:0;font-size:26px;line-height:1.4;color:#0b2347">검증을 원하는 질문이 등록되었습니다</h1></td></tr>
${answerIndex >= 0 ? section('등록된 질문', content.slice(0, answerIndex)) + section('AI 답변 (변호사 검증 전)', content.slice(answerIndex + answerMarker.length)) : section('등록된 질문', content)}
${
  link
    ? `<tr><td align="center" style="padding:0 24px 28px"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#2563eb" style="border-radius:8px;mso-padding-alt:16px 32px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:16px 32px;color:#fff;text-decoration:none;font-weight:bold">Office에서 검증하기</a></td></tr></table>
<p style="font-size:13px;line-height:1.7;color:#64748b">${lines(tail.slice(candidate.length).trim())}</p>
<p style="font-size:12px;color:#64748b">버튼이 열리지 않으면 아래 주소로 접속해 주세요.</p><a href="${escapeHtml(link)}" style="font-size:13px;color:#2563eb;overflow-wrap:anywhere">${escapeHtml(link)}</a></td></tr>`
    : ''
}
</table><p style="font-size:12px;color:#64748b">AI QAVER · 검증 요청 안내</p></td></tr></table></body></html>`;
}

// Render the queued snapshot at send time so retries use the renewed link.
export function renderAnswerEmail(text: string): string {
  const marker = '\n\n답변 확인 링크 (30일간 유효)\n';
  const linkIndex = text.lastIndexOf(marker);
  const tail = linkIndex >= 0 ? text.slice(linkIndex + marker.length) : '';
  const candidate = tail.split('\n')[0]!;
  let link = '';
  try {
    const url = new URL(candidate);
    if (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      /^#answer=[a-f0-9]{64}$/.test(url.hash)
    )
      link = url.href;
  } catch {
    /* Old or malformed snapshots still retain their complete text. */
  }
  const content = link ? text.slice(0, linkIndex) : text;
  const parts = /^(.*?)\n\n질문\n(.*?)\n\n답변\n([\s\S]*)$/s.exec(content);
  const section = (label: string, value: string, background: string) => `
    <tr><td style="padding:0 24px 20px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${background};border:1px solid #e2e8f0;border-radius:12px"><tr><td style="padding:22px">
    <h2 style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#2563eb">${label}</h2>
    <div style="font-size:15px;line-height:1.85;color:#25364d;overflow-wrap:anywhere;word-break:break-word">${lines(value)}</div>
    </td></tr></table></td></tr>`;
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>AI QAVER 전문가 답변 안내</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,'Malgun Gothic','Apple SD Gothic Neo',sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">등록하신 질문에 전문가 답변이 도착했습니다. 답변을 확인하고 질문을 이어가세요.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9"><tr><td align="center" style="padding:28px 12px">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-top:4px solid #2563eb;border-radius:16px">
<tr><td style="padding:24px 24px 18px;border-bottom:1px solid #eef2f7"><img src="https://search.aiqaver.com/brand/aiqaver-logo.png" width="180" alt="AI QAVER" style="display:block;width:180px;max-width:100%;height:auto;border:0;color:#082349;font-size:24px;font-weight:bold"></td></tr>
<tr><td style="padding:30px 24px 24px"><p style="margin:0 0 12px;font-size:12px;line-height:1.5;font-weight:bold;letter-spacing:1px;color:#2563eb">EXPERT ANSWER</p>
<h1 style="margin:0 0 16px;font-size:26px;line-height:1.4;letter-spacing:-1px;color:#0b2347">전문가 답변이 도착했습니다</h1>
<p style="margin:0;font-size:15px;line-height:1.8;color:#64748b">${parts ? lines(parts[1]!) : '등록하신 질문에 대한 답변을 확인해 주세요.'}</p></td></tr>
${parts ? section('등록하신 질문', parts[2]!, '#f8fafc') + section('전문가 답변', parts[3]!, '#ffffff') : section('답변 안내', content, '#f8fafc')}
${
  link
    ? `<tr><td align="center" style="padding:8px 24px 28px"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td align="center" bgcolor="#2563eb" style="border-radius:8px;mso-padding-alt:16px 32px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:16px 32px;border:1px solid #2563eb;border-radius:8px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;line-height:1.4">답변 확인하기</a></td></tr></table><p style="margin:14px 0 0;font-size:13px;line-height:1.7;color:#64748b">답변 확인 링크의 유효기간은 30일입니다.<br>질문과 답변을 확인하고 이어서 질문할 수 있습니다.</p></td></tr>
<tr><td style="padding:20px 24px;background:#f8fafc;border-top:1px solid #e2e8f0"><p style="margin:0 0 10px;font-size:12px;line-height:1.8;color:#64748b">버튼이 열리지 않으면 아래 주소를 복사해 브라우저에 붙여 넣어 주세요.</p><a href="${escapeHtml(link)}" style="font-size:12px;line-height:1.8;color:#2563eb;overflow-wrap:anywhere;word-break:break-all">${escapeHtml(link)}</a><p style="margin:14px 0 0;font-size:12px;line-height:1.8;color:#64748b">${lines(tail.slice(candidate.length).trim())}</p></td></tr>`
    : ''
}
</table>
<!--[if mso]></td></tr></table><![endif]-->
<p style="margin:20px 0 0;font-size:12px;line-height:1.7;color:#64748b">AI QAVER · 전문가 답변 안내</p>
</td></tr></table></body></html>`;
}
