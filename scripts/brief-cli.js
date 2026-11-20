// Runs in GitHub Actions at 8am IST. Usage: node brief-cli.js <path-to-data-repo-checkout>
// 1) materialises recurring + event-prep tasks into data/tasks.json  2) writes mail.json for send_mail.py
const fs = require('fs'), path = require('path');
const core = require('../core.js');
const root = process.argv[2] || '.';
const rd = (n, def) => { try { return JSON.parse(fs.readFileSync(path.join(root, 'data', n + '.json'), 'utf8')); } catch (e) { return def; } };
const d = { config: rd('config', {}), tasks: rd('tasks', []), events: rd('events', []), pipeline: rd('pipeline', []), decisions: rd('decisions', []), inbox: rd('inbox', []) };

const have = new Set(d.tasks.map(t => t.key).filter(Boolean));
const adds = core.computeAdds(d).filter(a => !have.has(a.key));
if (adds.length) {
  d.tasks = d.tasks.concat(adds);
  fs.writeFileSync(path.join(root, 'data', 'tasks.json'), JSON.stringify(d.tasks, null, 1));
  console.log('Added', adds.length, 'auto tasks');
}

const to = (d.config.emailTo || []).join(',');
if (!to) { console.error('config.emailTo is empty - set it in the app Settings.'); process.exit(1); }
const brief = core.buildBrief(d);
const body = brief +
  '\n\n----\nPaste the text above into the WhatsApp group' +
  (d.config.groupLink ? ':\n' + d.config.groupLink : '.') +
  (d.config.appUrl ? '\n\nOpen Inflekt OS: ' + d.config.appUrl : '') + '\n';
const subject = 'Inflekt OS brief - ' + core.fday(core.today());
fs.writeFileSync(path.join(process.env.RUNNER_TEMP || '.', 'mail.json'), JSON.stringify({ to, subject, body }));
console.log(brief);
