/**
 * Skill taxonomy used by the deterministic local engine (and by résumé/JD parsing helpers everywhere).
 * Each skill carries aliases (for matching) and a category + domains (for interview framing).
 */

export type SkillCategory = 'language' | 'framework' | 'tool' | 'concept' | 'database' | 'cloud' | 'soft'

export interface SkillDef {
  name: string
  aliases: string[]
  category: SkillCategory
  domains: string[]
}

const s = (name: string, category: SkillCategory, aliases: string[], domains: string[]): SkillDef => ({
  name,
  category,
  aliases: [name.toLowerCase(), ...aliases.map((a) => a.toLowerCase())],
  domains,
})

export const SKILLS: SkillDef[] = [
  // languages
  s('Python', 'language', ['py', 'python3'], ['ai/ml', 'data', 'backend', 'fullstack', 'devops']),
  s('Java', 'language', ['java8', 'java 8', 'java11', 'java17', 'core java'], ['backend', 'android', 'fullstack']),
  s('JavaScript', 'language', ['js', 'es6', 'ecmascript'], ['frontend', 'fullstack', 'backend', 'mobile']),
  s('TypeScript', 'language', ['ts'], ['frontend', 'fullstack', 'backend']),
  s('C++', 'language', ['cpp', 'c plus plus'], ['backend', 'ai/ml', 'embedded']),
  s('C', 'language', ['c language', 'ansi c'], ['embedded', 'backend']),
  s('C#', 'language', ['csharp', 'c sharp', '.net core'], ['backend', 'mobile', 'game']),
  s('Go', 'language', ['golang'], ['backend', 'devops', 'cloud']),
  s('Rust', 'language', ['rustlang'], ['backend', 'embedded']),
  s('Kotlin', 'language', ['kotlin jvm'], ['mobile', 'android']),
  s('Swift', 'language', ['swiftui language'], ['mobile', 'ios']),
  s('PHP', 'language', ['php8'], ['backend']),
  s('R', 'language', ['r language', 'rstudio'], ['data', 'ai/ml']),
  s('SQL', 'language', ['ansi sql', 't-sql', 'plsql', 'pl/sql'], ['data', 'backend', 'ai/ml', 'fullstack']),
  s('Scala', 'language', ['scala3'], ['data', 'backend']),
  s('Dart', 'language', ['dart lang'], ['mobile']),
  s('MATLAB', 'language', ['matlab/octave'], ['ai/ml', 'embedded']),

  // frontend frameworks / libs
  s('React', 'framework', ['reactjs', 'react.js', 'react 18', 'react hooks'], ['frontend', 'fullstack', 'mobile']),
  s('Next.js', 'framework', ['nextjs', 'next 14'], ['frontend', 'fullstack']),
  s('Angular', 'framework', ['angularjs', 'angular 2+'], ['frontend']),
  s('Vue', 'framework', ['vuejs', 'vue.js', 'vue3'], ['frontend']),
  s('Svelte', 'framework', ['sveltekit'], ['frontend']),
  s('Redux', 'framework', ['redux toolkit', 'rtk'], ['frontend']),
  s('Tailwind CSS', 'framework', ['tailwind', 'tailwindcss'], ['frontend', 'fullstack']),
  s('HTML', 'framework', ['html5'], ['frontend']),
  s('CSS', 'framework', ['css3', 'scss', 'sass', 'less'], ['frontend']),
  s('Bootstrap', 'framework', ['bootstrap5'], ['frontend']),
  s('Material UI', 'framework', ['mui', 'material-ui'], ['frontend']),
  s('Framer Motion', 'framework', ['framer', 'motion library'], ['frontend']),
  s('Vite', 'tool', ['vitejs'], ['frontend']),
  s('Webpack', 'tool', ['webpack5'], ['frontend']),
  s('jQuery', 'framework', ['jquery3'], ['frontend']),
  s('Three.js', 'framework', ['threejs', 'three js'], ['frontend']),
  s('WebGL', 'concept', ['web gl'], ['frontend', 'game']),
  s('Responsive Design', 'concept', ['responsive web design', 'mobile-first'], ['frontend', 'ui/ux']),
  s('Accessibility', 'concept', ['a11y', 'wcag', 'aria'], ['frontend', 'ui/ux']),
  s('Figma', 'tool', ['figma design'], ['ui/ux', 'frontend']),
  s('Wireframing', 'concept', ['wireframes', 'mockups'], ['ui/ux']),
  s('User Research', 'concept', ['ux research', 'usability testing'], ['ui/ux']),
  s('Design Systems', 'concept', ['design system', 'component library'], ['ui/ux', 'frontend']),
  s('Prototyping', 'concept', ['prototype design'], ['ui/ux']),

  // backend
  s('Node.js', 'framework', ['nodejs', 'node js', 'node'], ['backend', 'fullstack']),
  s('Express.js', 'framework', ['expressjs', 'express js', 'express'], ['backend', 'fullstack']),
  s('NestJS', 'framework', ['nest.js', 'nestjs'], ['backend']),
  s('Django', 'framework', ['django rest framework', 'drf'], ['backend', 'ai/ml', 'fullstack']),
  s('Flask', 'framework', ['flask api'], ['backend', 'ai/ml']),
  s('FastAPI', 'framework', ['fast api'], ['backend', 'ai/ml']),
  s('Spring Boot', 'framework', ['springboot', 'spring framework', 'spring mvc'], ['backend']),
  s('Laravel', 'framework', ['laravel php'], ['backend']),
  s('Ruby on Rails', 'framework', ['rails', 'ror'], ['backend']),
  s('.NET', 'framework', ['dotnet', 'asp.net', 'aspnet core'], ['backend']),
  s('REST APIs', 'concept', ['rest api', 'restful', 'rest', 'api design'], ['backend', 'fullstack', 'mobile']),
  s('GraphQL', 'concept', ['graph ql', 'apollo graphql'], ['backend', 'frontend']),
  s('gRPC', 'concept', ['grpc protobuf'], ['backend']),
  s('WebSockets', 'concept', ['websocket', 'socket.io', 'socketio'], ['backend', 'fullstack']),
  s('Microservices', 'concept', ['micro services', 'service oriented'], ['backend', 'cloud', 'devops']),
  s('System Design', 'concept', ['system architecture', 'high level design', 'hld', 'low level design', 'lld'], ['backend', 'fullstack', 'cloud']),
  s('Caching', 'concept', ['cache design', 'redis cache', 'caching strategy'], ['backend', 'cloud']),
  s('Message Queues', 'concept', ['kafka', 'rabbitmq', 'sqs', 'pub/sub', 'event driven'], ['backend', 'cloud', 'data']),
  s('Celery', 'tool', ['celery worker'], ['backend', 'ai/ml']),
  s('Authentication', 'concept', ['auth', 'jwt', 'oauth', 'oauth2', 'oauth 2.0', 'session management', 'sso'], ['backend', 'fullstack', 'cybersecurity']),
  s('API Security', 'concept', ['rate limiting', 'input validation', 'owasp api'], ['cybersecurity', 'backend']),

  // databases
  s('PostgreSQL', 'database', ['postgres', 'psql', 'pgsql'], ['backend', 'data', 'fullstack']),
  s('MySQL', 'database', ['mysql8', 'mariadb'], ['backend', 'data']),
  s('MongoDB', 'database', ['mongo', 'mongoose'], ['backend', 'fullstack']),
  s('SQLite', 'database', ['sqlite3'], ['backend', 'mobile']),
  s('Redis', 'database', ['redis cache'], ['backend', 'cloud']),
  s('Supabase', 'database', ['supabase postgres'], ['backend', 'fullstack']),
  s('Firebase', 'database', ['firestore', 'firebase auth'], ['mobile', 'frontend', 'fullstack']),
  s('Elasticsearch', 'database', ['elastic search', 'opensearch'], ['data', 'backend']),
  s('Database Design', 'concept', ['normalization', 'schema design', 'erd'], ['backend', 'data']),
  s('Query Optimization', 'concept', ['indexing', 'query tuning', 'execution plan', 'explain analyze'], ['backend', 'data']),
  s('Transactions', 'concept', ['acid', 'transaction isolation'], ['backend', 'data']),
  s('ORMs', 'concept', ['orm', 'prisma', 'sequelize', 'typeorm', 'hibernate', 'sqlalchemy'], ['backend']),
  s('Vector Databases', 'database', ['pinecone', 'faiss', 'chroma', 'pgvector', 'weaviate'], ['ai/ml', 'data']),

  // ai / ml
  s('Machine Learning', 'concept', ['ml', 'supervised learning', 'unsupervised learning'], ['ai/ml', 'data']),
  s('Deep Learning', 'concept', ['neural networks', 'neural network', 'dl'], ['ai/ml']),
  s('TensorFlow', 'framework', ['tf', 'tensorflow2', 'keras'], ['ai/ml']),
  s('PyTorch', 'framework', ['torch'], ['ai/ml']),
  s('scikit-learn', 'framework', ['sklearn', 'scikit learn'], ['ai/ml', 'data']),
  s('NLP', 'concept', ['natural language processing', 'text classification', 'tokenization'], ['ai/ml', 'data']),
  s('Computer Vision', 'concept', ['cv', 'opencv', 'image processing', 'object detection', 'yolo'], ['ai/ml']),
  s('Large Language Models', 'concept', ['llm', 'llms', 'gpt', 'transformers', 'bert', 'prompt engineering', 'generative ai', 'genai'], ['ai/ml']),
  s('RAG', 'concept', ['retrieval augmented generation', 'vector search', 'embeddings', 'semantic search'], ['ai/ml', 'backend']),
  s('Pandas', 'framework', ['pandas dataframe'], ['data', 'ai/ml']),
  s('NumPy', 'framework', ['numpy arrays'], ['data', 'ai/ml']),
  s('Matplotlib', 'framework', ['seaborn', 'plotly'], ['data', 'ai/ml']),
  s('Statistics', 'concept', ['statistical analysis', 'hypothesis testing', 'probability', 'p-value', 'a/b testing'], ['data', 'ai/ml']),
  s('Feature Engineering', 'concept', ['feature selection', 'feature scaling'], ['ai/ml', 'data']),
  s('Model Evaluation', 'concept', ['cross validation', 'precision recall', 'f1 score', 'roc auc', 'confusion matrix'], ['ai/ml', 'data']),
  s('Hyperparameter Tuning', 'concept', ['grid search', 'random search', 'optuna'], ['ai/ml']),
  s('Overfitting', 'concept', ['regularization', 'dropout', 'bias variance'], ['ai/ml']),
  s('Imbalanced Data', 'concept', ['class imbalance', 'smote', 'class weights'], ['ai/ml', 'data']),
  s('MLOps', 'concept', ['model deployment', 'model monitoring', 'ml pipeline'], ['ai/ml', 'devops', 'cloud']),
  s('Data Cleaning', 'concept', ['data preprocessing', 'data wrangling', 'missing values'], ['data', 'ai/ml']),
  s('Data Visualization', 'concept', ['dashboards', 'tableau', 'power bi', 'powerbi'], ['data']),
  s('ETL', 'concept', ['etl pipeline', 'data pipeline', 'airflow', 'dbt', 'spark', 'pyspark'], ['data', 'ai/ml']),
  s('Big Data', 'concept', ['hadoop', 'hive', 'databricks', 'data warehouse', 'snowflake'], ['data']),
  s('Experimental Design', 'concept', ['experiment design', 'controlled experiment'], ['data', 'ai/ml']),

  // cloud / devops
  s('AWS', 'cloud', ['amazon web services', 'ec2', 's3', 'lambda', 'aws cloud'], ['cloud', 'devops', 'backend']),
  s('Azure', 'cloud', ['microsoft azure', 'azure cloud'], ['cloud', 'devops']),
  s('Google Cloud', 'cloud', ['gcp', 'google cloud platform'], ['cloud', 'devops']),
  s('Docker', 'tool', ['containers', 'dockerfile', 'containerization'], ['devops', 'cloud', 'backend']),
  s('Kubernetes', 'tool', ['k8s', 'eks', 'helm'], ['devops', 'cloud']),
  s('CI/CD', 'concept', ['continuous integration', 'continuous deployment', 'github actions', 'jenkins', 'gitlab ci', 'pipelines'], ['devops', 'backend']),
  s('Terraform', 'tool', ['infrastructure as code', 'iac', 'cloudformation'], ['devops', 'cloud']),
  s('Linux', 'tool', ['unix', 'bash', 'shell scripting', 'ubuntu'], ['devops', 'backend', 'cybersecurity']),
  s('Git', 'tool', ['github', 'gitlab', 'version control', 'bitbucket'], ['backend', 'frontend', 'fullstack', 'devops']),
  s('Monitoring', 'concept', ['observability', 'prometheus', 'grafana', 'logging', 'datadog'], ['devops', 'cloud']),
  s('Serverless', 'concept', ['lambda functions', 'cloud functions', 'edge functions'], ['cloud', 'backend']),
  s('Networking', 'concept', ['dns', 'http', 'tcp/ip', 'load balancer', 'cdn'], ['cloud', 'devops', 'cybersecurity']),

  // security
  s('Penetration Testing', 'concept', ['pentest', 'ethical hacking', 'burp suite', 'nmap', 'metasploit'], ['cybersecurity']),
  s('Vulnerability Assessment', 'concept', ['cve', 'cvss', 'vulnerability scanning', 'nessus'], ['cybersecurity']),
  s('OWASP Top 10', 'concept', ['owasp', 'sql injection', 'xss', 'csrf', 'injection attacks'], ['cybersecurity', 'backend']),
  s('Cryptography', 'concept', ['encryption', 'hashing', 'tls', 'ssl', 'aes', 'rsa'], ['cybersecurity']),
  s('Threat Modeling', 'concept', ['threat model', 'attack surface', 'mitre att&ck'], ['cybersecurity']),
  s('Incident Response', 'concept', ['soc', 'siem', 'forensics'], ['cybersecurity']),
  s('Secure Coding', 'concept', ['secure sdlc', 'secure development'], ['cybersecurity', 'backend']),
  s('Identity Management', 'concept', ['iam', 'rbac', 'least privilege'], ['cybersecurity', 'cloud']),
  s('Row Level Security', 'concept', ['rls', 'supabase rls'], ['backend', 'cybersecurity']),

  // mobile / qa / other
  s('React Native', 'framework', ['rn', 'expo'], ['mobile', 'frontend']),
  s('Flutter', 'framework', ['flutter dart'], ['mobile']),
  s('Android', 'framework', ['android studio', 'jetpack compose'], ['mobile']),
  s('iOS', 'framework', ['swift ios', 'xcode', 'uikit'], ['mobile']),
  s('Unit Testing', 'concept', ['jest', 'pytest', 'junit', 'vitest', 'mocha', 'test cases'], ['qa', 'backend', 'frontend']),
  s('Integration Testing', 'concept', ['e2e testing', 'cypress', 'playwright', 'selenium', 'end to end tests'], ['qa']),
  s('Test Automation', 'concept', ['automation framework', 'regression suite', 'test coverage'], ['qa']),
  s('Manual Testing', 'concept', ['test plan', 'bug reporting', 'qa process'], ['qa']),
  s('Performance Testing', 'concept', ['load testing', 'jmeter', 'k6', 'latency'], ['qa', 'devops']),
  s('Agile', 'soft', ['scrum', 'kanban', 'sprint planning', 'agile methodology'], ['general software', 'fullstack', 'backend', 'frontend']),
  s('Code Review', 'soft', ['peer review', 'pull request review'], ['backend', 'frontend', 'fullstack']),
  s('Debugging', 'soft', ['troubleshooting', 'root cause analysis', 'debug'], ['backend', 'frontend', 'fullstack', 'devops']),
  s('Documentation', 'soft', ['technical writing', 'readme', 'api docs'], ['backend', 'frontend', 'fullstack']),
  s('Problem Solving', 'soft', ['analytical skills', 'critical thinking'], ['general software', 'backend', 'frontend', 'ai/ml', 'data']),
  s('Communication', 'soft', ['presentation skills', 'stakeholder communication', 'verbal communication'], ['general software']),
  s('Teamwork', 'soft', ['collaboration', 'cross functional', 'team player'], ['general software']),
  s('Leadership', 'soft', ['mentoring', 'team lead', 'ownership'], ['general software']),
  s('Time Management', 'soft', ['prioritisation', 'prioritization', 'deadlines'], ['general software']),
  s('Adaptability', 'soft', ['learning agility', 'fast learner'], ['general software']),
  s('Stakeholder Management', 'soft', ['client communication', 'business requirements'], ['general software']),
]

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  'ai/ml': ['machine learning', 'deep learning', 'ml engineer', 'data scientist', 'ai engineer', 'artificial intelligence', 'nlp', 'computer vision', 'llm', 'generative ai', 'model training'],
  data: ['data analyst', 'data engineer', 'analytics', 'business intelligence', 'sql', 'etl', 'data warehouse', 'statistics', 'tableau'],
  frontend: ['frontend', 'front-end', 'front end', 'react developer', 'ui developer', 'web developer', 'angular', 'vue'],
  backend: ['backend', 'back-end', 'back end', 'api developer', 'node developer', 'java developer', 'server side', 'django', 'spring'],
  fullstack: ['full stack', 'full-stack', 'fullstack', 'mern', 'mean stack'],
  mobile: ['android', 'ios', 'mobile developer', 'react native', 'flutter', 'app developer'],
  devops: ['devops', 'sre', 'site reliability', 'platform engineer', 'ci/cd', 'infrastructure'],
  cloud: ['cloud engineer', 'cloud architect', 'aws', 'azure', 'gcp', 'cloud solutions'],
  cybersecurity: ['security analyst', 'cyber security', 'cybersecurity', 'soc analyst', 'penetration', 'infosec', 'security engineer'],
  'ui/ux': ['ui/ux', 'ux designer', 'ui designer', 'product designer', 'user experience', 'interaction design'],
  qa: ['qa engineer', 'quality assurance', 'test engineer', 'sdet', 'automation tester'],
  'general software': ['software engineer', 'software developer', 'programmer', 'sde', 'application developer'],
}

export function canonicalSkill(raw: string): string {
  const needle = raw.trim().toLowerCase()
  if (!needle) return raw.trim()
  const exact = SKILLS.find((skill) => skill.aliases.includes(needle) || skill.name.toLowerCase() === needle)
  if (exact) return exact.name
  const partial = SKILLS.find((skill) => skill.aliases.some((alias) => alias.length > 2 && needle.includes(alias)))
  return partial ? partial.name : raw.trim().replace(/\s+/g, ' ')
}

export function normalizeSkillList(list: string[], max = 60): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of list) {
    const name = canonicalSkill(item)
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    out.push(name)
    if (out.length >= max) break
  }
  return out
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Find taxonomy skills mentioned in a block of text (word-boundary aware, length-safe). */
export function detectSkills(text: string, opts: { domains?: string[] } = {}): SkillDef[] {
  const haystack = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `
  const found: SkillDef[] = []
  for (const skill of SKILLS) {
    if (opts.domains?.length && !skill.domains.some((d) => opts.domains!.includes(d))) continue
    const hit = skill.aliases.some((alias) => {
      const pattern = new RegExp(`(^|[^a-z0-9+#.])${escapeRegex(alias)}([^a-z0-9+#]|$)`, 'i')
      return pattern.test(haystack)
    })
    if (hit) found.push(skill)
  }
  return found
}

export function detectSkillNames(text: string, opts: { domains?: string[] } = {}): string[] {
  return normalizeSkillList(detectSkills(text, opts).map((skill) => skill.name), 80)
}

export function skillsByCategory(defs: SkillDef[], category: SkillCategory): string[] {
  return normalizeSkillList(defs.filter((d) => d.category === category).map((d) => d.name))
}

export function inferDomain(text: string): { domain: string; score: number } {
  const haystack = text.toLowerCase()
  let best = { domain: 'general software', score: 0 }
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    let score = 0
    for (const keyword of keywords) {
      if (haystack.includes(keyword)) score += keyword.split(' ').length
    }
    if (score > best.score) best = { domain, score }
  }
  if (best.score === 0) {
    const detected = detectSkills(text)
    const tally = new Map<string, number>()
    for (const skill of detected) {
      for (const domain of skill.domains) tally.set(domain, (tally.get(domain) ?? 0) + 1)
    }
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
    if (top) best = { domain: top[0], score: top[1] }
  }
  return best
}

export const SOFT_SKILL_HINTS = [
  'communication',
  'leadership',
  'teamwork',
  'problem solving',
  'ownership',
  'collaboration',
  'adaptability',
  'mentoring',
  'stakeholder',
  'time management',
  'analytical',
  'attention to detail',
  'presentation',
]

export function domainLabel(domain: string): string {
  const labels: Record<string, string> = {
    'ai/ml': 'AI / Machine Learning',
    data: 'Data & Analytics',
    frontend: 'Frontend Engineering',
    backend: 'Backend Engineering',
    fullstack: 'Full-Stack Engineering',
    mobile: 'Mobile Engineering',
    devops: 'DevOps / Platform',
    cloud: 'Cloud Engineering',
    cybersecurity: 'Cybersecurity',
    'ui/ux': 'Product Design (UI/UX)',
    qa: 'Quality Engineering',
    'general software': 'Software Engineering',
  }
  return labels[domain] ?? 'Software Engineering'
}
