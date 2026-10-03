const html = await Bun.file("content/journal/learning.html").text();

// Body only, and drop the page-level <style> blocks.
const bodyStart = html.indexOf("<body>");
let body = html.slice(bodyStart + 6, html.lastIndexOf("</body>"));
body = body.replace(/<style[\s\S]*?<\/style>/g, "");

const tags = new Map<string, number>();
for (const m of body.matchAll(/<([a-z][a-z0-9]*)\b/gi)) {
  const t = m[1]!.toLowerCase();
  tags.set(t, (tags.get(t) ?? 0) + 1);
}
console.log("=== 标签统计 ===");
for (const [t, n] of [...tags].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t.padEnd(10)} ${n}`);
}

console.log("\n=== span 的 style 种类 ===");
const styles = new Map<string, number>();
for (const m of body.matchAll(/<span[^>]*style="([^"]*)"/g)) {
  const s = m[1]!.trim();
  styles.set(s, (styles.get(s) ?? 0) + 1);
}
for (const [s, n] of styles) console.log(`  ${n}x  ${s}`);

console.log("\n=== 所有 class 属性 ===");
const classes = new Map<string, number>();
for (const m of body.matchAll(/class="([^"]*)"/g)) {
  classes.set(m[1]!, (classes.get(m[1]!) ?? 0) + 1);
}
for (const [c, n] of classes) console.log(`  ${n}x  ${c}`);

console.log("\n=== h1 / h2 / h3 / h5 文本 ===");
for (const m of body.matchAll(/<(h[1-6])>([\s\S]*?)<\/\1>/g)) {
  const text = m[2]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  console.log(`  ${m[1]}  ${text}`);
}

console.log("\n=== del 内容 ===");
for (const m of body.matchAll(/<del>([\s\S]*?)<\/del>/g)) {
  console.log(`  ${m[1]!.replace(/<[^>]+>/g, "").trim()}`);
}

console.log("\n=== 顶层块顺序(前 40 个) ===");
let shown = 0;
for (const m of body.matchAll(
  /<(h[1-6]|hr|p|div|ul|ol|blockquote|pre|table)\b[^>]*>/g,
)) {
  if (shown++ >= 40) break;
  console.log(`  ${m[0]}`);
}

console.log(`\nzh div: ${(body.match(/<div class="zh">/g) ?? []).length}`);
console.log(`en div: ${(body.match(/<div class="en">/g) ?? []).length}`);
console.log(
  `裸 <p>(不在 div 里的): 需要人工看，总 p = ${(body.match(/<p>/g) ?? []).length}`,
);
