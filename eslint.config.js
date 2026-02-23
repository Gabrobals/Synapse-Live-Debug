// ESLint Flat Config — Synapse Live Debug
// Every rule here is REAL and documented at https://eslint.org/docs/latest/rules/
// Rules marked ✅ are auto-fixable with --fix; others require manual intervention.

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    files: ["frontend/js/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",        // no ES modules in this project
      globals: {
        // Browser globals
        window: "readonly", document: "readonly", console: "readonly",
        fetch: "readonly", navigator: "readonly", setTimeout: "readonly",
        clearTimeout: "readonly", setInterval: "readonly", clearInterval: "readonly",
        requestAnimationFrame: "readonly", cancelAnimationFrame: "readonly",
        HTMLElement: "readonly", Event: "readonly", CustomEvent: "readonly",
        MutationObserver: "readonly", ResizeObserver: "readonly",
        IntersectionObserver: "readonly", WebSocket: "readonly",
        EventSource: "readonly", AbortController: "readonly", AbortSignal: "readonly",
        URL: "readonly", URLSearchParams: "readonly",
        localStorage: "readonly", sessionStorage: "readonly",
        history: "readonly", location: "readonly",
        performance: "readonly", crypto: "readonly",
        alert: "readonly", confirm: "readonly", prompt: "readonly",
        Blob: "readonly", FileReader: "readonly", File: "readonly",
        FormData: "readonly", Headers: "readonly", Request: "readonly", Response: "readonly",
        Notification: "readonly", SpeechSynthesisUtterance: "readonly",
        speechSynthesis: "readonly", AudioContext: "readonly",
        getComputedStyle: "readonly", matchMedia: "readonly",
        atob: "readonly", btoa: "readonly",
        TextEncoder: "readonly", TextDecoder: "readonly",
        structuredClone: "readonly", queueMicrotask: "readonly",
        // Project globals (defined in config.js, notifications.js, etc.)
        SynapseApp: "writable", SynapseBus: "readonly",
        SynapseIcons: "readonly",
        CONFIG: "readonly", CONFIG_IDE: "readonly",
        EVENT_CATEGORIES: "readonly",
        EVENT_ICONS: "readonly", EVENT_COLORS: "readonly",
        INFRA_CATEGORIES: "readonly",
        Notifications: "readonly", ConnectionManager: "readonly",
      },
    },
    rules: {
      // ── Bug detection (NOT auto-fixable — shows real problems) ───────
      "no-undef":              "error",   // using undefined variables
      "no-unreachable":        "error",   // code after return/throw/break
      "no-constant-condition": "warn",    // if (true) / while (false)
      "no-dupe-args":          "error",   // function(a, a) {}
      "no-dupe-keys":          "error",   // { a: 1, a: 2 }
      "no-duplicate-case":     "error",   // switch duplicate case
      "use-isnan":             "error",   // x === NaN (always false)
      "valid-typeof":          "error",   // typeof x === "strig"
      "no-self-assign":        "error",   // x = x
      "no-self-compare":       "warn",    // x === x
      "no-empty":              "warn",    // empty {} blocks
      "no-fallthrough":        "warn",    // switch case without break
      "no-unused-vars":        "warn",    // declared but never used
      "no-loss-of-precision":  "error",   // 9007199254740993 (too large for float)
      "no-invalid-regexp":     "error",   // new RegExp('[')
      "no-sparse-arrays":      "warn",    // [1, , 3]
      "no-unsafe-negation":    "error",   // !key in obj (vs !(key in obj))
      "no-cond-assign":        "warn",    // if (x = 5) vs if (x === 5)
      "no-constant-binary-expression": "error", // "a" + {} always "[object Object]"
      "no-constructor-return":  "error",  // returning from constructor
      "no-promise-executor-return": "warn", // new Promise(r => { return 5 })
      "no-template-curly-in-string": "warn", // "Hello ${name}" (quotes not backticks)
      "no-unmodified-loop-condition": "warn", // while(x) without modifying x
      "no-inner-declarations":  "warn",   // function inside block

      // ── Code quality (NOT auto-fixable but important) ────────────────
      "no-console":            "warn",    // console.* (suggestions only, NOT --fix)
      "no-alert":              "warn",    // alert(), confirm(), prompt()
      "no-eval":               "error",   // eval() is dangerous
      "no-implied-eval":       "error",   // setTimeout("code")
      "no-throw-literal":      "error",   // throw "error" (should throw Error)
      "no-new-wrappers":       "error",   // new String(), new Number()
      "no-proto":              "error",   // __proto__ deprecated
      "no-iterator":           "error",   // __iterator__ deprecated
      "no-shadow-restricted-names": "error", // let undefined = 5
      "require-await":         "warn",    // async function without await
      "no-return-assign":      "warn",    // return x = 5

      // ── Auto-fixable rules (✅ these are fixed by --fix) ────────────
      "no-debugger":           "error",   // ✅ removes debugger statements
      "no-extra-semi":         "error",   // ✅ removes unnecessary ;
      "no-extra-boolean-cast": "warn",    // ✅ if (!!x) → if (x)
      "no-regex-spaces":       "warn",    // ✅ /a  b/ → /a {2}b/
      "no-undef-init":         "warn",    // ✅ let x = undefined → let x
      "no-unneeded-ternary":   "warn",    // ✅ x ? true : false → !!x
      "no-useless-return":     "warn",    // ✅ removes pointless return
      "no-lonely-if":          "warn",    // ✅ else { if → else if
      "no-var":                "warn",    // ✅ var → let/const
      "prefer-const":          "warn",    // ✅ let → const when never reassigned
      "eqeqeq":               ["warn", "smart"],  // ✅ == → === (smart: allows == null)
      "curly":                 ["warn", "multi-line"], // ✅ enforce {} for multi-line
      "dot-notation":          "warn",    // ✅ obj["key"] → obj.key
      "no-else-return":        "warn",    // ✅ if/return/else → if/return
      "object-shorthand":      "warn",    // ✅ { fn: function() → { fn()
      "prefer-template":       "warn",    // ✅ "a" + b → `a${b}`
      "yoda":                  "warn",    // ✅ "red" === color → color === "red"
      "operator-assignment":   "warn",    // ✅ x = x + 1 → x += 1
      "prefer-arrow-callback": ["warn", { "allowNamedFunctions": true }], // ✅ function(){} → () => {}
      "no-useless-rename":     "warn",    // ✅ { x: x } → { x }
      "no-useless-computed-key": "warn",  // ✅ { ["a"]: 1 } → { a: 1 }
      "prefer-numeric-literals": "warn",  // ✅ parseInt("0xFF",16) → 0xFF
      "prefer-exponentiation-operator": "warn", // ✅ Math.pow(a,b) → a**b
      "prefer-object-spread":  "warn",    // ✅ Object.assign({},x) → {...x}
      "sort-imports":          ["warn", { "ignoreDeclarationSort": true, "ignoreMemberSort": false }], // ✅
    },
  },
];
