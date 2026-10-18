import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  DateField,
  EMPTY_DATE,
  formatDate,
  isDateComplete,
  type DateParts,
} from "../components/DateField";
import { SecretProgress } from "../components/SecretProgress";
import envelope from "../content/secret.enc.json";
import { attemptOpen, CANCELLED, type Attempt } from "../lib/secretOpen";
import {
  expectedMs,
  normalizeIdentity,
  type Envelope,
} from "../lib/secretKey";
import { secret, site } from "../site.config";

/**
 * The gated page: two fields, and the page itself if they open it.
 *
 * Everything needed to try the door is already on the visitor's machine —
 * the ciphertext is in the bundle and the key derivation runs in the
 * browser. There is no request to make and nothing to ask a server, which is
 * the only reason this works on a host that serves static files and nothing
 * else.
 *
 * What that costs is that the attempt cannot be rate-limited. A visitor can
 * try as many names as they like, as fast as their machine allows, and the
 * only thing standing in the way is how slow Argon2id is. See the note in
 * `lib/secretKey.ts` for what that is and is not worth.
 *
 * It also costs the thing a login page normally does for free: there is no
 * server to say *why* it did not open. One attempt is ten seconds of
 * Argon2id and then a yes or a no, with nothing in between to go on. So the
 * form refuses to spend that time on an answer that cannot be right — the
 * button does not arm until there is a name and a date that exists, which is
 * why the date is typed in three boxes rather than left to whatever
 * `<input type="date">` does in this particular browser. And once it is
 * spending it, it says so in front of everything else, because ten seconds of
 * a page that has not visibly changed is a page the reader reloads.
 */

/**
 * What the door says. Here rather than in `site.config.ts`, which describes
 * the site — its sections, their titles, the streams the nav is built from.
 * This is one page's own text, read by nothing but the markup below it.
 */
const copy = {
  title: "加密区",
  intro:
    "您正在尝试访问加密区的内容，本区域内容需要您输入相关信息打开，" +
    "本网站为静态资源托管，不会对您的数据进行存储，" +
    "同时使用 https 进行信息传输的加密操作，具备一定安全性。",
  intro2:
    "如果您仍不希望输入包括您的个人姓名和出生时间等任何个人信息，" +
    "您可以通过 Administrator 沟通，通过当天有效的密钥进行访问。",
} as const;

/**
 * `working.html` is the decrypted page once it arrives, held back while the
 * dialog finishes what it is saying. The dialog is what decides when it is
 * handed over; the two states after it are what the reader ends up in.
 */
type State =
  | { at: "closed"; wrong: boolean }
  | { at: "working"; html: string | null }
  | { at: "failed"; why: string }
  | { at: "open"; html: string };

const NO_SLOT =
  "身份无效，如果您认为该内容属于系统误判，请联系系统管理员";
const BROKE =
  "验证失败，可能是由于本设备内存不够，请更换浏览器或设备后再试。";

export function SecretPage() {
  const [name, setName] = useState("");
  const [date, setDate] = useState<DateParts>(EMPTY_DATE);
  const [state, setState] = useState<State>({ at: "closed", wrong: false });
  const field = useRef<HTMLInputElement>(null);
  const attempt = useRef<Attempt | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    document.title = `${secret.label} — ${site.name}`;
  }, []);

  // A reader who navigates away mid-attempt should not leave a worker
  // chewing on 128 MiB behind them.
  useEffect(() => () => attempt.current?.cancel(), []);

  const working = state.at === "working";
  const busy = working || state.at === "failed";
  const ready = name.trim() !== "" && isDateComplete(date);

  const open = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !ready) return;

    setState({ at: "working", html: null });

    const running = attemptOpen(
      normalizeIdentity(name, formatDate(date)),
      envelope as Envelope,
    );
    attempt.current = running;

    running.html.then(
      (html) => {
        attempt.current = null;
        // Held, not shown: the dialog calls `onReveal` when it has finished
        // its piece, and that is what puts the page on screen.
        if (html === null) setState({ at: "failed", why: NO_SLOT });
        else setState({ at: "working", html });
      },
      (error) => {
        attempt.current = null;
        if (error === CANCELLED) return;
        console.error("secret:", error);
        setState({ at: "failed", why: BROKE });
      },
    );
  };

  /** The dialog is done and the page is in hand. */
  const reveal = () => {
    setState((now) =>
      now.at === "working" && now.html !== null
        ? { at: "open", html: now.html }
        : now,
    );
  };

  const stop = () => {
    attempt.current?.cancel();
    attempt.current = null;
    setState({ at: "closed", wrong: false });
  };

  const dismiss = () => {
    setState({ at: "closed", wrong: true });
    // Put them back where the mistake probably is: the date was checked
    // before the attempt, the spelling of the name was not.
    field.current?.focus();
    field.current?.select();
  };

  if (state.at === "open") {
    return (
      <div className="page page--reading">
        <div className="shell secret">
          {/* The fragment is authored by hand and arrives through AES-GCM,
              which authenticates it: nobody can put anything into it without
              the content key, so there is nothing here for a sanitiser to
              do that the cipher has not already done. */}
          <div
            className="secret__content"
            dangerouslySetInnerHTML={{ __html: state.html }}
          />

          <div className="note__foot">
            <Link to="/" className="toc__back">
              ← 返回首页
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--reading">
      <div className="shell secret secret--gate">
        <form
          className="secret__gate"
          onSubmit={open}
          // The checking is the form's own, and it is about whether an
          // attempt is worth two seconds of Argon2id — not the browser's
          // idea of a valid field. Its bubbles would only talk over the one
          // line of status text.
          noValidate
          data-working={working || undefined}
        >
          <p className="label secret__kicker">{secret.label}</p>
          <h1 className="secret__title">{copy.title}</h1>
          <p className="secret__intro">{copy.intro}</p>
          <p className="secret__intro">{copy.intro2}</p>

          <div className="secret__fields">
            <div className="secret__field">
              <label className="label secret__name" htmlFor="secret-name">
                全名
              </label>
              <input
                id="secret-name"
                ref={field}
                className="secret__text"
                type="text"
                name="name"
                value={name}
                autoComplete="name"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="secret__field">
              <span className="label secret__name" id="secret-birthday">
                生日
              </span>
              <DateField
                value={date}
                onChange={setDate}
                disabled={busy}
                labelledBy="secret-birthday"
              />
            </div>
          </div>

          <div className="secret__actions">
            <button
              className="secret__open"
              type="submit"
              disabled={busy || !ready}
            >
              {busy ? "正在验证…" : "打开"}
            </button>

            {/* What is left on the form after a failed attempt has been
                dismissed. Progress is the dialog's business now. */}
            <p
              className="secret__says"
              role="status"
              aria-live="polite"
              data-wrong={(state.at === "closed" && state.wrong) || undefined}
            >
              {state.at === "closed" && state.wrong ? "信息错误" : ""}
            </p>
          </div>

          <div className="note__foot">
            <Link to="/" className="toc__back">
              ← 返回首页
            </Link>
          </div>
        </form>
      </div>

      {busy && (
        <SecretProgress
          phase={state.at === "failed" ? "failed" : "working"}
          failure={state.at === "failed" ? state.why : ""}
          expected={expectedMs((envelope as Envelope).kdf)}
          opened={state.at === "working" && state.html !== null}
          onReveal={reveal}
          onCancel={stop}
          onDismiss={dismiss}
        />
      )}
    </div>
  );
}
