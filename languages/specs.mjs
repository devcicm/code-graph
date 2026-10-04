// code-graph · languages/specs.mjs — lenguajes integrados, definidos como datos
const KW = (s) => s.split(' ');
const C_LIKE = { line: ['//'], block: [['/*', '*/']], strings: ['"', "'"] };

export const python = {
  id: 'python', name: 'Python', exts: ['.py'], ignore: ['__pycache__', 'venv', '.venv', 'site-packages', '.tox', '.mypy_cache', '.pytest_cache', 'egg-info'], relSyntax: '#',
  tests: ['(^|/)tests?/', '(^|/)test_[^/]+\\.py$', '_test\\.py$', 'conftest\\.py$'],
  lexer: { line: ['#'], triple: ['"""', "'''"], strings: ['"', "'"], keywords: KW('and as assert async await break class continue def del elif else except finally for from global if import in is lambda None nonlocal not or pass raise return try while with yield True False self cls') },
  imports: [
    { re: '^[ \\t]*from[ \\t]+(\\.*[\\w.]*)[ \\t]+import[ \\t]*\\(([^)]*)\\)', spec: 1, names: 2, namesStyle: 'python' },
    { re: '^[ \\t]*from[ \\t]+(\\.*[\\w.]*)[ \\t]+import[ \\t]+([^\\n(][^\\n]*)', spec: 1, names: 2, namesStyle: 'python' },
    { re: '^[ \\t]*import[ \\t]+([\\w.]+(?:[ \\t]+as[ \\t]+\\w+)?(?:[ \\t]*,[ \\t]*[\\w.]+(?:[ \\t]+as[ \\t]+\\w+)?)*)', spec: 1, multi: true, namesStyle: 'pyimport' },
  ],
  defs: [{ re: '^(?:async[ \\t]+)?def[ \\t]+(\\w+)', kind: 'function', name: 1, exported: 'noUnderscore' }, { re: '^class[ \\t]+(\\w+)', kind: 'class', name: 1, exported: 'noUnderscore' }, { re: '^([A-Z][A-Z0-9_]+)[ \\t]*(?::[^=]+)?=', kind: 'const', name: 1 }],
  resolver: 'dotted', lazyIndented: true,
};

export const csharp = {
  id: 'csharp', name: 'C#', exts: ['.cs'], ignore: ['bin', 'obj', 'packages', '.vs'], relSyntax: '//',
  tests: ['(^|/)tests?/', 'Tests?\\.cs$', '\\.Tests?/', 'UnitTests?/'],
  lexer: { ...C_LIKE, keywords: KW('abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while async await record get set init required partial yield') },
  imports: [{ re: '^[ \\t]*(?:global[ \\t]+)?using[ \\t]+(?:static[ \\t]+)?(?:\\w+[ \\t]*=[ \\t]*)?([\\w.]+)[ \\t]*;', spec: 1 }],
  namespace: '^[ \\t]*namespace[ \\t]+([\\w.]+)',
  defs: [
    { re: '^[ \\t]*(?:\\[[^\\]]*\\][ \\t]*)*(?:(?:public|internal|private|protected|static|abstract|sealed|partial|readonly|unsafe|new|file)[ \\t]+)*(class|interface|struct|enum|record(?:[ \\t]+(?:class|struct))?)[ \\t]+(\\w+)', kindGroup: 1, name: 2, exported: 'public' },
    { re: '^[ \\t]+(?:public|internal|protected)[ \\t]+(?:(?:static|async|virtual|override|abstract|sealed|unsafe|new|extern)[ \\t]+)*[\\w<>\\[\\],.?]+[ \\t]+(\\w+)[ \\t]*\\(', kind: 'function', name: 1, exported: 'always' },
  ],
  resolver: 'namespace', sep: '.',
};

export const java = {
  id: 'java', name: 'Java', exts: ['.java'], ignore: ['target', 'build', '.gradle', 'out', '.idea'], relSyntax: '//',
  tests: ['(^|/)src/test/', 'Tests?\\.java$', '(^|/)tests?/'],
  lexer: { ...C_LIKE, keywords: KW('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while var record sealed permits null true false') },
  imports: [{ re: '^[ \\t]*import[ \\t]+(?:static[ \\t]+)?([\\w.]+(?:\\.\\*)?)[ \\t]*;', spec: 1 }],
  namespace: '^[ \\t]*package[ \\t]+([\\w.]+)[ \\t]*;',
  defs: [{ re: '^[ \\t]*(?:@\\w+(?:\\([^)]*\\))?[ \\t]+)*(?:(?:public|protected|private|static|final|abstract|sealed|non-sealed)[ \\t]+)*(class|interface|enum|record|@interface)[ \\t]+(\\w+)', kindGroup: 1, name: 2, exported: 'public' }],
  resolver: 'namespace', sep: '.',
};

export const kotlin = {
  id: 'kotlin', name: 'Kotlin', exts: ['.kt'], ignore: ['build', '.gradle', 'out', '.idea'], relSyntax: '//',
  tests: ['(^|/)src/test/', 'Tests?\\.kt$', '(^|/)tests?/'],
  lexer: { ...C_LIKE, keywords: KW('as break class continue do else false for fun if in interface is null object package return super this throw true try typealias typeof val var when while data sealed open abstract override private protected public internal suspend inline companion') },
  imports: [{ re: '^[ \\t]*import[ \\t]+([\\w.]+(?:\\.\\*)?)(?:[ \\t]+as[ \\t]+\\w+)?[ \\t]*$' }].map((p) => ({ ...p, spec: 1 })),
  namespace: '^[ \\t]*package[ \\t]+([\\w.]+)',
  defs: [{ re: '^[ \\t]*(?:@\\w+[ \\t]+)*(?:(?:public|private|internal|protected|data|sealed|open|abstract|enum|annotation|inner)[ \\t]+)*(class|interface|object)[ \\t]+(\\w+)', kindGroup: 1, name: 2, exported: 'public' }, { re: '^[ \\t]*(?:(?:public|internal|private|override|suspend|inline)[ \\t]+)*fun[ \\t]+(?:<[^>]+>[ \\t]+)?(?:[\\w.]+\\.)?(\\w+)[ \\t]*\\(', kind: 'function', name: 1, exported: 'public' }],
  resolver: 'namespace', sep: '.',
};

export const php = {
  id: 'php', name: 'PHP', exts: ['.php'], ignore: ['vendor', 'cache', 'storage'], relSyntax: '//',
  tests: ['(^|/)tests?/', 'Test\\.php$'],
  lexer: { line: ['//', '#'], block: [['/*', '*/']], strings: ['"', "'"], keywords: KW('abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while yield null true false self parent') },
  imports: [
    { re: '^[ \\t]*use[ \\t]+(?:function[ \\t]+|const[ \\t]+)?([\\w\\\\]+)(?:[ \\t]+as[ \\t]+\\w+)?[ \\t]*;', spec: 1 },
    { re: '(?:require|include)(?:_once)?[ \\t]*\\(?[ \\t]*[\'"]([^\'"]+\\.php)[\'"]', spec: 1, kind: 'require', resolve: 'file' },
  ],
  namespace: '^[ \\t]*namespace[ \\t]+([\\w\\\\]+)[ \\t]*;',
  defs: [{ re: '^[ \\t]*(?:(?:abstract|final|readonly)[ \\t]+)*(class|interface|trait|enum)[ \\t]+(\\w+)', kindGroup: 1, name: 2 }, { re: '^[ \\t]*(?:(?:public|protected|private|static|abstract|final)[ \\t]+)*function[ \\t]+(\\w+)', kind: 'function', name: 1, exported: 'always' }],
  resolver: 'namespace', sep: '\\',
};

export const go = {
  id: 'go', name: 'Go', exts: ['.go'], ignore: ['vendor'], relSyntax: '//',
  tests: ['_test\\.go$'],
  lexer: { line: ['//'], block: [['/*', '*/']], strings: ['"', "'", '`'], keywords: KW('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false iota') },
  imports: [
    { re: '^[ \\t]*import[ \\t]+(?:(\\w+|\\.|_)[ \\t]+)?"([^"]+)"', spec: 2, names: 1, namesStyle: 'goalias' },
    { re: '^[ \\t]*import[ \\t]*\\(([\\s\\S]*?)\\)', each: { re: '^[ \\t]*(?:(\\w+|\\.|_)[ \\t]+)?"([^"]+)"', spec: 2, alias: 1 }, spec: 1 },
  ],
  defs: [{ re: '^func[ \\t]+(\\w+)', kind: 'function', name: 1, exported: 'capitalized' }, { re: '^func[ \\t]*\\([^)]*\\)[ \\t]*(\\w+)', kind: 'function', name: 1, exported: 'capitalized' }, { re: '^type[ \\t]+(\\w+)[ \\t]+(struct|interface)?', kind: 'type', name: 1, exported: 'capitalized' }, { re: '^(?:var|const)[ \\t]+(\\w+)', kind: 'const', name: 1, exported: 'capitalized' }],
  resolver: 'go',
};

export const rust = {
  id: 'rust', name: 'Rust', exts: ['.rs'], ignore: ['target'], relSyntax: '//',
  tests: ['(^|/)tests/', '_test\\.rs$'],
  lexer: { line: ['//'], block: [['/*', '*/']], strings: ['"'], keywords: KW('as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while') },
  imports: [
    { re: '^[ \\t]*(?:pub(?:\\([^)]*\\))?[ \\t]+)?mod[ \\t]+(\\w+)[ \\t]*;', spec: 1, kind: 'mod' },
    { re: '^[ \\t]*(?:pub(?:\\([^)]*\\))?[ \\t]+)?use[ \\t]+((?:crate|self|super)(?:::\\w+)*)', spec: 1 },
  ],
  defs: [{ re: '^[ \\t]*(pub(?:\\([^)]*\\))?[ \\t]+)?(?:async[ \\t]+|unsafe[ \\t]+)*(fn|struct|enum|trait|type|const|static|mod)[ \\t]+(\\w+)', kindGroup: 2, name: 3, exported: 'group', exportGroup: 1 }],
  resolver: 'rust',
};

export const cpp = {
  id: 'cpp', name: 'C / C++', exts: ['.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hh', '.hxx'], ignore: ['build', 'cmake-build-debug', 'out', 'third_party'], relSyntax: '//',
  tests: ['(^|/)tests?/', '_test\\.(c|cc|cpp)$'],
  lexer: { ...C_LIKE, keywords: KW('auto break case char class const continue default do double else enum extern float for goto if inline int long namespace new operator private protected public register return short signed sizeof static struct switch template this throw try typedef union unsigned using virtual void volatile while nullptr true false') },
  imports: [{ re: '^[ \\t]*#[ \\t]*include[ \\t]*"([^"]+)"', spec: 1, kind: 'include' }, { re: '^[ \\t]*#[ \\t]*include[ \\t]*<([^>]+)>', spec: 1, kind: 'include' }],
  defs: [{ re: '^[ \\t]*(?:typedef[ \\t]+)?(class|struct|enum|union)[ \\t]+(\\w+)', kindGroup: 1, name: 2 }, { re: '^[\\w:<>*&\\t ]*?[ \\t*&]([A-Za-z_]\\w*)[ \\t]*\\([^;{]*\\)[ \\t]*(?:const)?[ \\t]*\\{?[ \\t]*$', kind: 'function', name: 1, exported: 'always' }],
  resolver: 'include',
};

export const BUILTIN = [python, csharp, java, kotlin, php, go, rust, cpp];
