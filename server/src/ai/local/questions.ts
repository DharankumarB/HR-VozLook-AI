import type { Difficulty, EvaluationContext, GeneratedQuestion, QuestionContext, QuestionType } from '../types.js'
import { normalizeSkillList } from './skills.js'
import { similarity } from './text.js'

/**
 * Deterministic question generator used when no LLM key is configured (and as the fallback
 * whenever the provider fails). Questions are drawn from curated, role-aware banks and grounded
 * in the candidate's own résumé anchors, then de-duplicated against everything already asked.
 */

interface BankItem {
  q: string
  topics: string[]
}

type Bank = Record<Difficulty, BankItem[]>

const CONCEPT_BANK: Record<string, Bank> = {
  Python: {
    easy: [{ q: 'What do you use Python for most, and which language features do you rely on daily?', topics: ['use cases', 'language features', 'standard library'] }],
    medium: [
      { q: 'Explain the difference between a list and a tuple in Python, and when you would choose each in real code.', topics: ['mutability', 'performance', 'use cases'] },
      { q: 'How does Python handle memory management, and what practical impact does that have on the code you write?', topics: ['garbage collection', 'reference counting', 'memory profiling'] },
    ],
    hard: [
      { q: 'Walk me through how you would debug a Python service that becomes slow only under production load.', topics: ['profiling', 'GIL', 'I/O bound work', 'caching', 'measurement'] },
      { q: 'How would you design a Python package structure for a growing project so that it stays testable and importable?', topics: ['packaging', 'dependency injection', 'import cycles', 'testing'] },
    ],
  },
  Java: {
    easy: [{ q: 'What makes Java a strong choice for backend services, in your experience?', topics: ['JVM', 'typing', 'ecosystem'] }],
    medium: [
      { q: 'Explain how the JVM manages memory and what a garbage collection pause means for a live service.', topics: ['heap', 'GC', 'latency'] },
      { q: 'What is the difference between an interface and an abstract class, and how do you decide in practice?', topics: ['abstraction', 'inheritance', 'contracts'] },
    ],
    hard: [{ q: 'How would you diagnose and fix a memory leak in a long-running Java application?', topics: ['heap dumps', 'profiling', 'leak patterns', 'monitoring'] }],
  },
  JavaScript: {
    easy: [{ q: 'What are the JavaScript concepts you work with most often, and where do they show up in your projects?', topics: ['scope', 'async', 'DOM'] }],
    medium: [
      { q: 'Explain how the event loop works and why it matters when you write asynchronous code.', topics: ['call stack', 'task queue', 'microtasks'] },
      { q: 'What is a closure, and can you describe a real place you used one?', topics: ['lexical scope', 'state capture', 'modules'] },
    ],
    hard: [{ q: 'How would you track down a memory leak in a single-page application that slows down after hours of use?', topics: ['detached DOM nodes', 'listeners', 'heap snapshots', 'profiling'] }],
  },
  TypeScript: {
    easy: [{ q: 'What problem does TypeScript solve for a team, compared with plain JavaScript?', topics: ['static typing', 'tooling', 'refactoring safety'] }],
    medium: [
      { q: 'Explain generics in TypeScript and give an example where they removed duplication in your code.', topics: ['generics', 'type inference', 'reuse'] },
      { q: 'What is the difference between `any`, `unknown` and `never`, and when do you reach for each?', topics: ['type safety', 'narrowing', 'exhaustiveness'] },
    ],
    hard: [{ q: 'How do you type a complex API layer so that runtime data and compile-time types cannot drift apart?', topics: ['runtime validation', 'schema first', 'zod', 'boundaries'] }],
  },
  React: {
    easy: [{ q: 'Explain the difference between props and state in React using an example from your own work.', topics: ['props', 'state', 'data flow'] }],
    medium: [
      { q: 'How do you decide when a component needs `useMemo` or `useCallback` — and when it is premature optimisation?', topics: ['memoisation', 'profiling', 're-render cost'] },
      { q: 'Walk me through how you would structure data fetching and loading/error states in a React screen.', topics: ['effects', 'loading states', 'error boundaries', 'caching'] },
    ],
    hard: [
      { q: 'How would you diagnose and fix unnecessary re-renders in a large React application?', topics: ['profiler', 'memoisation', 'state placement', 'context splitting'] },
      { q: 'Describe how you would architect state management for an app with offline support and optimistic updates.', topics: ['cache', 'conflict resolution', 'optimistic UI', 'sync'] },
    ],
  },
  'Node.js': {
    easy: [{ q: 'What is Node.js good at, and what kinds of workloads would you avoid running on it?', topics: ['event loop', 'I/O', 'CPU bound work'] }],
    medium: [
      { q: 'How do you handle errors and validation in an Express API so clients always get a usable response?', topics: ['middleware', 'validation', 'status codes', 'error contract'] },
      { q: 'Explain how you would protect an API endpoint from abuse without breaking legitimate traffic.', topics: ['rate limiting', 'auth', 'idempotency', 'observability'] },
    ],
    hard: [{ q: 'A Node service handles 10x traffic after a launch and starts timing out. How do you investigate and scale it?', topics: ['profiling', 'horizontal scaling', 'queues', 'caching', 'load balancing'] }],
  },
  SQL: {
    easy: [{ q: 'What is the difference between WHERE and HAVING, and when does each apply?', topics: ['filtering', 'aggregation', 'query order'] }],
    medium: [
      { q: 'Explain the different types of JOINs and give a case where the wrong join silently changes your result.', topics: ['inner join', 'left join', 'fan-out', 'nulls'] },
      { q: 'How do indexes change query performance, and what is the cost of adding one?', topics: ['B-tree', 'write overhead', 'selectivity', 'execution plan'] },
    ],
    hard: [
      { q: 'A report query takes 40 seconds on a large table. How would you approach optimising it?', topics: ['EXPLAIN', 'index strategy', 'partitioning', 'rewriting the query'] },
      { q: 'How do you reason about window functions versus aggregation for running totals and rankings?', topics: ['window functions', 'partition by', 'framing', 'performance'] },
    ],
  },
  PostgreSQL: {
    easy: [{ q: 'What have you built with PostgreSQL, and which features did you find most useful?', topics: ['schema design', 'constraints', 'indexes'] }],
    medium: [
      { q: 'How would you model a many-to-many relationship and keep referential integrity intact?', topics: ['join tables', 'foreign keys', 'constraints', 'indexes'] },
      { q: 'Explain transactions and isolation levels, and describe a bug that wrong isolation can cause.', topics: ['ACID', 'isolation', 'dirty reads', 'locking'] },
    ],
    hard: [{ q: 'Two services update the same rows concurrently and produce inconsistent totals. How do you fix that?', topics: ['locking', 'serialisable', 'optimistic concurrency', 'idempotency'] }],
  },
  MongoDB: {
    easy: [{ q: 'When would you choose a document database over a relational one?', topics: ['schema flexibility', 'access patterns', 'trade-offs'] }],
    medium: [{ q: 'How do you design documents and indexes in MongoDB so common queries stay fast?', topics: ['embedding vs referencing', 'indexes', 'query patterns'] }],
    hard: [{ q: 'How would you keep data consistent across MongoDB and a relational database in one product?', topics: ['dual writes', 'outbox pattern', 'eventual consistency', 'reconciliation'] }],
  },
  Redis: {
    easy: [{ q: 'What do you use a cache like Redis for, and what did it improve?', topics: ['caching', 'latency', 'TTL'] }],
    medium: [{ q: 'How do you decide what to cache, how long to cache it, and how to invalidate it safely?', topics: ['cache keys', 'TTL', 'invalidation', 'thundering herd'] }],
    hard: [{ q: 'Explain how you would build a distributed lock or rate limiter with Redis and the failure modes involved.', topics: ['atomics', 'expiry', 'split brain', 'clock skew'] }],
  },
  'REST APIs': {
    easy: [{ q: 'What makes an API "RESTful", and how do you keep your endpoints predictable?', topics: ['resources', 'verbs', 'status codes'] }],
    medium: [
      { q: 'How do you version an API without breaking existing clients?', topics: ['versioning strategy', 'deprecation', 'contracts'] },
      { q: 'How do you design pagination for an endpoint that returns a very large collection?', topics: ['offset vs cursor', 'stability', 'performance'] },
    ],
    hard: [{ q: 'How would you make a payment-style endpoint idempotent and safe to retry?', topics: ['idempotency keys', 'retries', 'consistency', 'timeouts'] }],
  },
  Authentication: {
    easy: [{ q: 'Explain in plain terms how a login session works in an app you built.', topics: ['credentials', 'session/token', 'expiry'] }],
    medium: [{ q: 'Compare cookie sessions with JWT access tokens and explain which you would pick for a web app.', topics: ['storage', 'revocation', 'CSRF/XSS', 'expiry'] }],
    hard: [{ q: 'How would you design authentication and authorisation for a multi-tenant product with strict data isolation?', topics: ['tenancy', 'claims', 'row level security', 'audit'] }],
  },
  'Row Level Security': {
    easy: [{ q: 'What problem does row-level security solve for a multi-user application?', topics: ['data isolation', 'policies', 'least privilege'] }],
    medium: [{ q: 'How would you write and test a database policy that lets users read only their own rows?', topics: ['policy predicates', 'auth.uid()', 'test cases', 'bypass risk'] }],
    hard: [{ q: 'How do you verify that no endpoint or query can leak another tenant’s data?', topics: ['defence in depth', 'server-side auth', 'policy tests', 'service role risks'] }],
  },
  Docker: {
    easy: [{ q: 'What problem did containers solve in a project you worked on?', topics: ['environment parity', 'images', 'isolation'] }],
    medium: [{ q: 'Walk me through how you would write a production Dockerfile for a Node or Python service.', topics: ['multi-stage build', 'layer caching', 'non-root user', 'image size'] }],
    hard: [{ q: 'How would you reduce the size and attack surface of a container image while keeping builds reproducible?', topics: ['distroless/alpine', 'pinning', 'secrets handling', 'scanning'] }],
  },
  Kubernetes: {
    easy: [{ q: 'What does Kubernetes give you that a single server deployment does not?', topics: ['scheduling', 'self-healing', 'scaling'] }],
    medium: [{ q: 'How do readiness and liveness probes change the behaviour of a rolling deployment?', topics: ['probes', 'draining', 'zero downtime', 'failure modes'] }],
    hard: [{ q: 'A deployment works locally but crash-loops in the cluster. How do you debug it systematically?', topics: ['logs', 'events', 'resource limits', 'config and secrets'] }],
  },
  AWS: {
    easy: [{ q: 'Which AWS services have you used, and what did you deploy with them?', topics: ['compute', 'storage', 'networking basics'] }],
    medium: [{ q: 'How would you design a cost-aware, failure-tolerant deployment for a web app on AWS?', topics: ['managed services', 'availability zones', 'cost', 'backups'] }],
    hard: [{ q: 'How do you handle secrets, IAM permissions and least privilege across multiple services and environments?', topics: ['IAM roles', 'secrets manager', 'least privilege', 'rotation'] }],
  },
  'CI/CD': {
    easy: [{ q: 'What steps run in your ideal CI pipeline before code reaches production?', topics: ['build', 'tests', 'lint', 'artifacts'] }],
    medium: [{ q: 'How do you keep deployments safe — describe your rollback strategy and what triggers it.', topics: ['canary/blue-green', 'health checks', 'rollback', 'monitoring'] }],
    hard: [{ q: 'How would you evolve a manual release process into automated deployments without breaking the team’s velocity?', topics: ['trunk based flow', 'feature flags', 'environments', 'observability'] }],
  },
  Git: {
    easy: [{ q: 'How do you keep your branches and commits clean when several people work on the same repository?', topics: ['branching', 'commit hygiene', 'code review'] }],
    medium: [{ q: 'Describe a merge conflict you resolved. What did you check before pushing?', topics: ['conflict resolution', 'testing after merge', 'communication'] }],
    hard: [{ q: 'A release is broken and the last five commits are suspects. How do you isolate the culprit quickly?', topics: ['bisect', 'revert strategy', 'release discipline'] }],
  },
  'System Design': {
    easy: [{ q: 'How do you decide what belongs in the frontend versus the backend of a feature?', topics: ['responsibilities', 'validation', 'security'] }],
    medium: [{ q: 'Design a URL shortener that must serve millions of redirects a day. What are the key decisions?', topics: ['id generation', 'storage choice', 'caching', 'analytics'] }],
    hard: [{ q: 'Design a notification system that reliably delivers email, push and SMS at scale. Walk through reliability and ordering.', topics: ['queues', 'retries and DLQ', 'idempotency', 'fan-out', 'user preferences'] }],
  },
  'Machine Learning': {
    easy: [{ q: 'Explain the difference between supervised and unsupervised learning, and give an example of each.', topics: ['labels', 'clustering', 'classification/regression'] }],
    medium: [
      { q: 'What is overfitting, how do you detect it, and which techniques do you use to control it?', topics: ['train/validation gap', 'regularisation', 'cross validation', 'data size'] },
      { q: 'How do you choose the right metric for a classification problem, and why not always accuracy?', topics: ['precision/recall', 'F1', 'ROC-AUC', 'business cost'] },
    ],
    hard: [
      { q: 'Your model performs well offline but badly in production. How do you diagnose the gap?', topics: ['data drift', 'leakage', 'training-serving skew', 'monitoring'] },
      { q: 'How would you approach an imbalanced classification problem where the minority class is the one that matters?', topics: ['resampling', 'class weights', 'threshold tuning', 'metric choice'] },
    ],
  },
  'Deep Learning': {
    easy: [{ q: 'What is a neural network learning, in your own words?', topics: ['weights', 'loss', 'gradient descent'] }],
    medium: [{ q: 'What problem do activation functions solve, and how would a network behave without them?', topics: ['non-linearity', 'vanishing gradients', 'ReLU'] }],
    hard: [{ q: 'How would you debug a network that trains but generalises poorly, or one that does not learn at all?', topics: ['learning rate', 'normalisation', 'data quality', 'regularisation', 'learning curves'] }],
  },
  TensorFlow: {
    easy: [{ q: 'Describe the workflow you follow when building and training a model in TensorFlow or Keras.', topics: ['data pipeline', 'model definition', 'training loop'] }],
    medium: [{ q: 'How do you monitor and debug a training run so you know when to stop?', topics: ['callbacks', 'early stopping', 'tensorboard', 'validation loss'] }],
    hard: [{ q: 'How would you take a trained model to production with acceptable latency and reproducibility?', topics: ['export/serving', 'batching', 'versioning', 'monitoring drift'] }],
  },
  PyTorch: {
    easy: [{ q: 'What do you like about PyTorch’s workflow compared with other frameworks you have used?', topics: ['eager execution', 'modules', 'debugging'] }],
    medium: [{ q: 'Explain a training loop you wrote: data loading, forward pass, loss, optimiser step, validation.', topics: ['DataLoader', 'loss', 'optimiser', 'validation'] }],
    hard: [{ q: 'How would you speed up training when a model does not fit in memory or training takes too long?', topics: ['mixed precision', 'gradient accumulation', 'checkpointing', 'distributed training'] }],
  },
  NLP: {
    easy: [{ q: 'What kinds of text problems have you worked on, and how did you prepare the text?', topics: ['tokenisation', 'cleaning', 'representation'] }],
    medium: [{ q: 'How would you build a text classifier for short user messages with limited labelled data?', topics: ['feature engineering', 'embeddings', 'transfer learning', 'evaluation'] }],
    hard: [{ q: 'How do you evaluate a text model where labels are subjective and the class balance shifts over time?', topics: ['annotation quality', 'inter-annotator agreement', 'drift', 'human-in-the-loop'] }],
  },
  'Computer Vision': {
    easy: [{ q: 'Describe a vision task you worked on — inputs, outputs, and how you measured success.', topics: ['input pipeline', 'model choice', 'metric'] }],
    medium: [{ q: 'How do you handle limited or poorly labelled image data in a vision project?', topics: ['augmentation', 'transfer learning', 'labelling strategy', 'validation split'] }],
    hard: [{ q: 'How would you deploy a real-time vision model on constrained hardware and keep accuracy acceptable?', topics: ['quantisation', 'pruning', 'latency budget', 'edge cases'] }],
  },
  'Large Language Models': {
    easy: [{ q: 'What have you used LLMs for, and where did they help most?', topics: ['use cases', 'prompting', 'limitations'] }],
    medium: [
      { q: 'How would you ground an LLM’s answers in a specific document set so it stops hallucinating?', topics: ['retrieval', 'chunking', 'embeddings', 'citations', 'evaluation'] },
      { q: 'What does a good prompt look like, and how do you test whether a prompt change is an improvement?', topics: ['instructions', 'examples', 'evaluation set', 'regression tests'] }],
    hard: [{ q: 'How would you evaluate and monitor an LLM feature in production, including cost and latency?', topics: ['offline evals', 'user feedback', 'guardrails', 'caching', 'cost per request'] }],
  },
  Statistics: {
    easy: [{ q: 'How do you decide whether a difference in results is meaningful or just noise?', topics: ['variability', 'sample size', 'significance'] }],
    medium: [{ q: 'Explain A/B testing: how you design one, size it, and read the result without fooling yourself.', topics: ['hypothesis', 'power', 'p-values', 'confounders'] }],
    hard: [{ q: 'How do you analyse an experiment when randomisation was imperfect or the sample is small?', topics: ['quasi-experiments', 'bootstrapping', 'bayesian thinking', 'caveats'] }],
  },
  'Model Evaluation': {
    easy: [{ q: 'Why do you need a validation set in addition to training data?', topics: ['generalisation', 'tuning', 'leakage'] }],
    medium: [{ q: 'How does k-fold cross-validation change the reliability of your reported model performance?', topics: ['variance', 'stratification', 'cost', 'leakage'] }],
    hard: [{ q: 'How would you build a trustworthy evaluation harness for a model that will be retrained every month?', topics: ['frozen test sets', 'slice metrics', 'drift detection', 'release gates'] }],
  },
  Overfitting: {
    easy: [{ q: 'What does it mean when a model performs much better on training data than on new data?', topics: ['generalisation gap', 'noise fitting'] }],
    medium: [{ q: 'Which regularisation techniques do you reach for first, and how do you know they helped?', topics: ['L1/L2', 'dropout', 'early stopping', 'validation curves'] }],
    hard: [{ q: 'Your team’s model improved offline and regressed in production. How do you find the real cause?', topics: ['leakage', 'distribution shift', 'label quality', 'monitoring'] }],
  },
  'Data Cleaning': {
    easy: [{ q: 'How do you handle missing values in a dataset, and what did you actually do in a project?', topics: ['imputation', 'dropping rows', 'flags', 'impact on model'] }],
    medium: [{ q: 'What checks do you run on a new dataset before trusting it for analysis or modelling?', topics: ['duplicates', 'outliers', 'types and ranges', 'leakage', 'documentation'] }],
    hard: [{ q: 'How do you make a data pipeline robust to dirty upstream data that arrives every day?', topics: ['validation contracts', 'quarantine', 'monitoring', 'backfills'] }],
  },
  'Feature Engineering': {
    easy: [{ q: 'Give an example of a feature you created that made a model meaningfully better.', topics: ['domain knowledge', 'derived features', 'impact measurement'] }],
    medium: [{ q: 'How do you handle categorical and time-based variables when preparing features?', topics: ['encoding', 'cyclical features', 'lags', 'scaling'] }],
    hard: [{ q: 'How do you avoid leakage when engineering features for a real production model?', topics: ['time splits', 'target encoding pitfalls', 'pipeline order', 'review'] }],
  },
  'Imbalanced Data': {
    easy: [{ q: 'What happens to a model when 99% of your examples belong to one class?', topics: ['majority bias', 'metric illusion', 'sampling'] }],
    medium: [{ q: 'Compare resampling with class weighting for imbalanced datasets, and say when you would use each.', topics: ['SMOTE', 'class weights', 'side effects', 'validation strategy'] }],
    hard: [{ q: 'In a fraud-style problem, how do you pick a decision threshold that respects the business cost of each error?', topics: ['cost matrix', 'precision-recall trade-off', 'calibration', 'monitoring'] }],
  },
  Python_pandas: {
    easy: [{ q: 'How do you usually load and explore a new dataset with pandas?', topics: ['read functions', 'summary statistics', 'dtypes'] }],
    medium: [{ q: 'Explain a non-trivial pandas transformation you have written, and how you made it efficient.', topics: ['groupby/apply', 'vectorisation', 'memory', 'index alignment'] }],
    hard: [{ q: 'How would you process a dataset that does not fit in memory?', topics: ['chunking', 'dtype optimisation', 'out-of-core tools', 'sampling strategy'] }],
  },
  'REST API Security': {
    easy: [{ q: 'What are the first security checks you add to a public API endpoint?', topics: ['authn/authz', 'input validation', 'rate limiting'] }],
    medium: [{ q: 'How do you protect user data at rest and in transit in a system you built?', topics: ['encryption', 'hashing', 'least privilege', 'logging hygiene'] }],
    hard: [{ q: 'Walk me through how you would review a codebase for injection and access-control flaws.', topics: ['OWASP', 'parameterised queries', 'authorisation checks', 'threat modelling'] }],
  },
  'OWASP Top 10': {
    easy: [{ q: 'Which web vulnerabilities do you check for most often, and why?', topics: ['injection', 'broken access control', 'misconfiguration'] }],
    medium: [{ q: 'How do you prevent SQL injection and XSS in a typical CRUD application?', topics: ['parameterised queries', 'output encoding', 'CSP', 'validation'] }],
    hard: [{ q: 'How would you build a security testing routine into a delivery pipeline?', topics: ['SAST/DAST', 'dependency scanning', 'secrets detection', 'triage'] }],
  },
  Penetration_x: {
    easy: [{ q: 'Describe your approach to assessing a web application you have never seen before.', topics: ['reconnaissance', 'scope', 'methodology'] }],
    medium: [{ q: 'How do you validate that a vulnerability finding is real and report it responsibly?', topics: ['reproduction', 'impact assessment', 'CVSS', 'responsible disclosure'] }],
    hard: [{ q: 'How do you test a network or application without disrupting production services?', topics: ['non-destructive testing', 'change windows', 'logging', 'communication'] }],
  },
  React_Native: {
    easy: [{ q: 'What is different about building a mobile app compared with a web app, from your experience?', topics: ['navigation', 'device constraints', 'offline behaviour'] }],
    medium: [{ q: 'How do you handle slow or offline networks in a mobile app?', topics: ['caching', 'optimistic UI', 'retries', 'state persistence'] }],
    hard: [{ q: 'How would you debug performance problems on low-end Android devices?', topics: ['profiling', 'list virtualisation', 'bundle size', 'memory'] }],
  },
  'Unit Testing': {
    easy: [{ q: 'What do you test first when you start writing tests for a new feature?', topics: ['critical paths', 'arrange/act/assert', 'edge cases'] }],
    medium: [{ q: 'How do you decide what belongs in a unit test versus an integration test?', topics: ['test pyramid', 'isolation', 'speed', 'confidence'] }],
    hard: [{ q: 'How do you test code that talks to databases, queues or third-party APIs without making the suite flaky?', topics: ['fakes/contracts', 'test containers', 'determinism', 'retries'] }],
  },
  'Accessibility': {
    easy: [{ q: 'What simple practices make a UI usable for people using keyboards or screen readers?', topics: ['semantic HTML', 'labels', 'focus order'] }],
    medium: [{ q: 'How do you test a component for accessibility, and what do you do with the findings?', topics: ['automated audits', 'manual keyboard testing', 'contrast', 'ARIA'] }],
    hard: [{ q: 'How would you retrofit accessibility into an existing product without rewriting it?', topics: ['audit', 'component library fixes', 'regression tests', 'training'] }],
  },
  'Responsive Design': {
    easy: [{ q: 'How do you approach building one layout that works on both mobile and desktop?', topics: ['breakpoints', 'flex/grid', 'touch targets'] }],
    medium: [{ q: 'Describe a layout bug you fixed on small screens and how you verified the fix.', topics: ['overflow', 'viewport testing', 'devtools', 'regression'] }],
    hard: [{ q: 'How would you define and enforce a consistent responsive design system across a large app?', topics: ['design tokens', 'component API', 'documentation', 'visual review'] }],
  },
}

/** Maps canonical skills onto keys present in CONCEPT_BANK. */
const SKILL_TO_BANK: Record<string, string> = {
  'scikit-learn': 'Machine Learning',
  NumPy: 'Python_pandas',
  Pandas: 'Python_pandas',
  Matplotlib: 'Python_pandas',
  'Data Visualization': 'Python_pandas',
  'Express.js': 'Node.js',
  FastAPI: 'Python',
  Flask: 'Python',
  Django: 'Python',
  'Spring Boot': 'Java',
  'Next.js': 'React',
  Angular: 'React',
  Vue: 'React',
  Svelte: 'React',
  Redux: 'React',
  'Tailwind CSS': 'Responsive Design',
  MySQL: 'SQL',
  SQLite: 'SQL',
  'Query Optimization': 'SQL',
  'Database Design': 'PostgreSQL',
  'Transactions': 'PostgreSQL',
  Supabase: 'PostgreSQL',
  Firebase: 'MongoDB',
  'Large Language Models': 'Large Language Models',
  'RAG': 'Large Language Models',
  'MLOps': 'Machine Learning',
  'Deep Learning': 'Deep Learning',
  'Model Evaluation': 'Model Evaluation',
  'Hyperparameter Tuning': 'Model Evaluation',
  'Google Cloud': 'AWS',
  Azure: 'AWS',
  Terraform: 'AWS',
  Serverless: 'AWS',
  Linux: 'Docker',
  Monitoring: 'CI/CD',
  Networking: 'System Design',
  Microservices: 'System Design',
  Caching: 'Redis',
  'Message Queues': 'System Design',
  'API Security': 'REST API Security',
  'Secure Coding': 'REST API Security',
  'Threat Modeling': 'Penetration_x',
  'Vulnerability Assessment': 'Penetration_x',
  Cryptography: 'REST API Security',
  'Identity Management': 'Authentication',
  'Problem Solving': 'System Design',
  Debugging: 'System Design',
  'Integration Testing': 'Unit Testing',
  'Test Automation': 'Unit Testing',
  'Manual Testing': 'Unit Testing',
  'Performance Testing': 'Unit Testing',
  Agile: 'System Design',
  'Code Review': 'Git',
  'Data Cleaning': 'Data Cleaning',
  'ETL': 'Data Cleaning',
  'Big Data': 'Data Cleaning',
  'Computer Vision': 'Computer Vision',
  NLP: 'NLP',
  PyTorch: 'PyTorch',
  TensorFlow: 'TensorFlow',
  Statistics: 'Statistics',
  'Experimental Design': 'Statistics',
}

const DOMAIN_BANK: Record<string, Bank> = {
  'ai/ml': {
    easy: [
      { q: 'Pick a model you trained recently and explain the problem it solved in plain language.', topics: ['problem framing', 'data', 'model choice', 'result'] },
      { q: 'How do you decide between a simple model and a complex one for a first iteration?', topics: ['baseline', 'interpretability', 'iteration speed'] },
    ],
    medium: [
      { q: 'Walk me through your end-to-end workflow for a machine learning project, from data collection to evaluation.', topics: ['data collection', 'splits', 'baseline', 'metrics', 'error analysis'] },
      { q: 'How would you explain your model’s predictions to a non-technical stakeholder?', topics: ['feature importance', 'plain language', 'confidence', 'limits'] },
    ],
    hard: [
      { q: 'How would you take a research notebook and turn it into a reliable production service?', topics: ['reproducibility', 'tests', 'serving', 'monitoring', 'rollback'] },
      { q: 'A stakeholder asks you to improve accuracy, but your metrics say the data is the bottleneck. What do you do?', topics: ['diagnosis', 'data quality', 'expectation setting', 'experiments'] },
    ],
  },
  data: {
    easy: [
      { q: 'How do you approach a new dataset when asked an open question like "why did sales drop?"', topics: ['clarifying the question', 'segmentation', 'time comparison'] },
      { q: 'What makes a chart or dashboard actually useful to a decision maker?', topics: ['clarity', 'context', 'actionability'] },
    ],
    medium: [
      { q: 'How do you validate that a number in a report is correct before sharing it?', topics: ['reconciliation', 'sanity checks', 'definitions', 'edge cases'] },
      { q: 'Describe a data quality problem you found and how you handled it end to end.', topics: ['detection', 'root cause', 'fix', 'prevention'] },
    ],
    hard: [
      { q: 'How would you design metrics for a product where the team currently argues about definitions?', topics: ['metric definitions', 'ownership', 'instrumentation', 'governance'] },
      { q: 'How do you handle a stakeholder who wants a conclusion the data does not support?', topics: ['evidence', 'uncertainty', 'alternatives', 'communication'] },
    ],
  },
  frontend: {
    easy: [
      { q: 'Walk me through how you would build a screen that loads data and needs loading, empty and error states.', topics: ['states', 'accessibility', 'layout'] },
      { q: 'What do you check before you consider a UI change finished?', topics: ['responsive behaviour', 'keyboard access', 'cross-browser', 'edge cases'] },
    ],
    medium: [
      { q: 'How do you keep a frontend codebase maintainable as features and contributors grow?', topics: ['component boundaries', 'state placement', 'testing', 'conventions'] },
      { q: 'How would you investigate a page that feels slow and fix the biggest bottleneck?', topics: ['measurement', 'bundle size', 'render cost', 'images/network'] },
    ],
    hard: [
      { q: 'How would you architect a large front-end so that teams can ship independently without breaking each other?', topics: ['module boundaries', 'contracts', 'design system', 'CI checks'] },
      { q: 'Describe how you would make a data-heavy table usable with thousands of rows and slow queries.', topics: ['virtualisation', 'server-side paging', 'caching', 'perceived performance'] },
    ],
  },
  backend: {
    easy: [
      { q: 'Explain how a request travels through a backend service you built, from route to database and back.', topics: ['routing', 'validation', 'persistence', 'response'] },
      { q: 'How do you decide the shape of an API response?', topics: ['consumer needs', 'consistency', 'pagination', 'errors'] },
    ],
    medium: [
      { q: 'How do you keep an API dependable when a downstream dependency becomes slow or unavailable?', topics: ['timeouts', 'retries', 'circuit breaking', 'fallbacks'] },
      { q: 'Describe how you would add observability so you can debug production issues quickly.', topics: ['structured logs', 'metrics', 'traces', 'alerting'] },
    ],
    hard: [
      { q: 'Design the backend for a feature with strict consistency requirements and explain your trade-offs.', topics: ['transactions', 'locking', 'idempotency', 'failure handling'] },
      { q: 'How would you migrate a monolith to services without a big-bang rewrite?', topics: ['strangler pattern', 'data ownership', 'interfaces', 'rollout plan'] },
    ],
  },
  fullstack: {
    easy: [
      { q: 'Describe a full-stack feature you built end to end — front end, API and database.', topics: ['feature scope', 'API design', 'data model', 'result'] },
      { q: 'How do you validate user input on both the client and the server, and why both?', topics: ['UX feedback', 'trust boundary', 'shared rules'] },
    ],
    medium: [
      { q: 'How do you keep frontend and backend contracts in sync as a product evolves?', topics: ['typed clients', 'schema', 'versioning', 'tests'] },
      { q: 'Where would you put authentication, authorisation and session handling in a full-stack app, and why there?', topics: ['token storage', 'server checks', 'CSRF/XSS', 'expiry'] },
    ],
    hard: [
      { q: 'A feature must work offline and sync later. How would you design it?', topics: ['local storage', 'conflict resolution', 'sync queue', 'idempotency'] },
      { q: 'How would you scale a full-stack app that is growing from hundreds to hundreds of thousands of users?', topics: ['caching', 'database indexes', 'background jobs', 'CDN', 'monitoring'] },
    ],
  },
  mobile: {
    easy: [
      { q: 'What did you build for mobile, and what was the hardest part of the mobile experience?', topics: ['platform constraints', 'screens', 'state'] },
      { q: 'How do you test an app on real devices before releasing?', topics: ['device matrix', 'manual testing', 'crash reports'] },
    ],
    medium: [
      { q: 'How do you manage app state and navigation in a mobile app with many screens?', topics: ['navigation patterns', 'state', 'deep links', 'restoration'] },
      { q: 'How do you handle slow networks, backgrounding and app restarts gracefully?', topics: ['caching', 'persistence', 'lifecycle', 'sync'] },
    ],
    hard: [
      { q: 'How would you reduce app size and improve startup time for users on low-end devices?', topics: ['tree shaking', 'lazy loading', 'asset optimisation', 'profiling'] },
      { q: 'Describe your release strategy for shipping safely to a large user base.', topics: ['staged rollout', 'feature flags', 'crash monitoring', 'rollback'] },
    ],
  },
  devops: {
    easy: [
      { q: 'What does your deployment process look like, step by step, for a service you maintain?', topics: ['build', 'test', 'release', 'verification'] },
      { q: 'Why is infrastructure as code preferable to manual setup, in your experience?', topics: ['repeatability', 'review', 'drift'] },
    ],
    medium: [
      { q: 'How do you make a deployment zero-downtime and safely reversible?', topics: ['health checks', 'rolling/blue-green', 'rollback', 'data migrations'] },
      { q: 'How do you monitor a service and decide what deserves an alert?', topics: ['SLOs', 'error budgets', 'signal vs noise', 'runbooks'] },
    ],
    hard: [
      { q: 'An intermittent failure hits production once a week. How do you investigate it?', topics: ['observability', 'hypothesis testing', 'timeline analysis', 'postmortem'] },
      { q: 'How would you cut cloud spend meaningfully without hurting reliability?', topics: ['usage analysis', 'rightsizing', 'autoscaling', 'storage lifecycle'] },
    ],
  },
  cloud: {
    easy: [
      { q: 'Which cloud services have you deployed, and what did each one do for you?', topics: ['compute', 'storage', 'networking', 'managed services'] },
      { q: 'What does "high availability" mean for the app you worked on?', topics: ['redundancy', 'failure domains', 'failover'] },
    ],
    medium: [
      { q: 'How would you design environments for development, staging and production to keep them consistent?', topics: ['IaC', 'config management', 'secrets', 'promotion flow'] },
      { q: 'How do you handle secrets and credentials across services and environments?', topics: ['secret stores', 'rotation', 'least privilege', 'audit'] },
    ],
    hard: [
      { q: 'Design the infrastructure for a product with unpredictable traffic spikes and a fixed budget.', topics: ['autoscaling', 'queues', 'caching', 'cost modelling'] },
      { q: 'How would you plan a multi-region deployment including data residency and failover?', topics: ['replication', 'consistency', 'routing', 'disaster recovery'] },
    ],
  },
  cybersecurity: {
    easy: [
      { q: 'What does a secure development lifecycle mean to you in day-to-day work?', topics: ['threat awareness', 'review', 'testing', 'patching'] },
      { q: 'How would you respond if you suspected a credential had leaked?', topics: ['containment', 'rotation', 'audit', 'communication'] },
    ],
    medium: [
      { q: 'Walk me through how you would assess the security posture of a small web application.', topics: ['inventory', 'access control', 'dependency risk', 'findings and prioritisation'] },
      { q: 'How do you prioritise vulnerabilities when you cannot fix everything at once?', topics: ['exploitability', 'asset criticality', 'CVSS', 'compensating controls'] },
    ],
    hard: [
      { q: 'Design detection and response for a service that is a high-value target.', topics: ['logging pipeline', 'SIEM rules', 'playbooks', 'tabletop exercises'] },
      { q: 'How would you balance usability and security for an engineering team that dislikes friction?', topics: ['paved roads', 'defaults', 'least privilege', 'education'] },
    ],
  },
  'ui/ux': {
    easy: [
      { q: 'Walk me through your process for turning a requirement into a usable screen.', topics: ['research', 'flows', 'wireframes', 'review'] },
      { q: 'How do you decide what the most important action on a screen is?', topics: ['hierarchy', 'user intent', 'visual weight'] },
    ],
    medium: [
      { q: 'How do you validate a design decision before investing in development?', topics: ['prototypes', 'usability tests', 'heuristics', 'iteration'] },
      { q: 'How do you design for accessibility and different screen sizes from the start?', topics: ['contrast', 'touch targets', 'responsive layout', 'keyboard access'] },
    ],
    hard: [
      { q: 'How would you redesign a workflow users complain about, with measurable success criteria?', topics: ['research', 'task metrics', 'iterative rollout', 'instrumentation'] },
      { q: 'How do you build a design system that engineering will actually adopt?', topics: ['tokens', 'component API', 'documentation', 'governance'] },
    ],
  },
  qa: {
    easy: [
      { q: 'How do you decide what to test first when time is limited?', topics: ['risk', 'critical paths', 'impact'] },
      { q: 'What makes a bug report genuinely useful to a developer?', topics: ['reproduction steps', 'environment', 'expected vs actual', 'evidence'] },
    ],
    medium: [
      { q: 'How do you decide which tests should be automated and which stay manual?', topics: ['frequency', 'stability', 'cost/benefit', 'maintenance'] },
      { q: 'Describe how you would test an API that powers a critical user journey.', topics: ['contracts', 'edge cases', 'auth', 'failure modes', 'data setup'] },
    ],
    hard: [
      { q: 'How would you make a flaky test suite trustworthy again?', topics: ['quarantine', 'determinism', 'waiting strategies', 'test data'] },
      { q: 'How do you build quality into a fast-moving team without becoming the bottleneck?', topics: ['shift left', 'pipeline gates', 'quality metrics', 'culture'] },
    ],
  },
  'general software': {
    easy: [
      { q: 'Describe the most recent thing you built and your specific contribution to it.', topics: ['problem', 'your role', 'technology', 'outcome'] },
      { q: 'Which programming languages and tools do you reach for first, and why?', topics: ['language choice', 'tooling', 'rationale'] },
    ],
    medium: [
      { q: 'Tell me about a bug that took real effort to find. How did you track it down?', topics: ['reproduction', 'hypotheses', 'tooling', 'fix and prevention'] },
      { q: 'How do you review someone else’s code, and what do you look for first?', topics: ['correctness', 'readability', 'edge cases', 'knowledge sharing'] },
    ],
    hard: [
      { q: 'Design the technical approach for a feature from scratch — requirements, trade-offs and rollout.', topics: ['requirements', 'design options', 'trade-offs', 'rollout', 'risks'] },
      { q: 'Tell me about a technical decision you made that turned out to be wrong. What did you do next?', topics: ['context', 'decision', 'learning', 'correction'] },
    ],
  },
}

const BEHAVIORAL_BANK: Bank = {
  easy: [
    { q: 'Tell me about a project you are proud of. What was your role and what made it work?', topics: ['situation', 'your contribution', 'outcome'] },
    { q: 'Describe a time you had to learn something new quickly to finish a task.', topics: ['learning approach', 'resources', 'result'] },
    { q: 'How do you organise your work when you have several deadlines at once?', topics: ['prioritisation', 'communication', 'delivery'] },
  ],
  medium: [
    { q: 'Tell me about a technical problem that took real effort to solve. How did you approach it?', topics: ['problem framing', 'approach', 'options considered', 'result', 'learning'] },
    { q: 'Describe a disagreement with a teammate about a technical decision. What happened?', topics: ['context', 'listening', 'evidence', 'resolution'] },
    { q: 'Tell me about a time you received critical feedback. What did you change afterwards?', topics: ['feedback', 'reflection', 'behaviour change'] },
    { q: 'Describe a situation where you had to work with incomplete information to deliver on time.', topics: ['assumptions', 'risk', 'communication', 'outcome'] },
  ],
  hard: [
    { q: 'Tell me about a time you failed at something you owned. What did you do about it and what changed?', topics: ['ownership', 'impact', 'recovery', 'learning'] },
    { q: 'Describe the most ambiguous project you have worked on and how you created clarity.', topics: ['ambiguity', 'stakeholders', 'incremental delivery', 'outcome'] },
    { q: 'Tell me about a time you had to push back on a request from someone senior to you.', topics: ['evidence', 'communication', 'alternatives', 'outcome'] },
  ],
}

const HR_BANK: Bank = {
  easy: [
    { q: 'Walk me through your background and what led you to apply for this role.', topics: ['career story', 'motivation', 'relevance'] },
    { q: 'What kind of work environment brings out your best work?', topics: ['working style', 'collaboration', 'autonomy'] },
    { q: 'Which parts of this job description excite you the most?', topics: ['role research', 'fit', 'motivation'] },
  ],
  medium: [
    { q: 'Why do you want to move into this role now, and what are you looking for that you do not have today?', topics: ['motivation', 'growth', 'self-awareness'] },
    { q: 'How do you handle feedback and performance pressure during a busy release?', topics: ['pressure', 'communication', 'prioritisation'] },
    { q: 'Where do you want your skills to be in two years, and how will this role get you there?', topics: ['goals', 'learning plan', 'commitment'] },
  ],
  hard: [
    { q: 'Tell me about a time you disagreed with a process the team followed, and what you did about it.', topics: ['initiative', 'diplomacy', 'evidence', 'impact'] },
    { q: 'What would your previous teammate say is your biggest area to improve, and what are you doing about it?', topics: ['self-awareness', 'feedback', 'action'] },
  ],
}

const SITUATIONAL_BANK: Bank = {
  easy: [
    { q: 'You are given a task in an unfamiliar codebase with a deadline this week. What is your first hour of work?', topics: ['orientation', 'questions', 'small safe change'] },
    { q: 'You notice a small but real bug in a feature you are about to hand over. What do you do?', topics: ['prioritisation', 'communication', 'ownership'] },
  ],
  medium: [
    { q: 'A requirement arrives mid-sprint and conflicts with what you are building. How do you handle it?', topics: ['trade-offs', 'stakeholder communication', 'scope', 'plan'] },
    { q: 'You inherit code with no tests that you must change today. What is your plan?', topics: ['characterisation tests', 'risk control', 'refactoring', 'verification'] },
    { q: 'A production issue affects some users but you cannot reproduce it. What is your next step?', topics: ['evidence gathering', 'observability', 'mitigation', 'follow-up'] },
  ],
  hard: [
    { q: 'Your team must choose between two architectures and the debate is stalling delivery. How do you move it forward?', topics: ['decision criteria', 'prototyping', 'ownership', 'reversibility'] },
    { q: 'Halfway through a project you realise the chosen approach will not meet the requirement. What do you do?', topics: ['early escalation', 'options', 'impact analysis', 'plan'] },
  ],
}

function bankItemFor(skill: string, difficulty: Difficulty): BankItem | null {
  const key = CONCEPT_BANK[skill] ? skill : SKILL_TO_BANK[skill] ? SKILL_TO_BANK[skill] : null
  if (!key || !CONCEPT_BANK[key]) return null
  const levels = CONCEPT_BANK[key]
  const pool = levels[difficulty] ?? levels.medium
  return pool[Math.floor(Math.random() * pool.length)] ?? null
}

function isDuplicate(question: string, asked: string[]): boolean {
  return asked.some((previous) => similarity(question, previous) > 0.62)
}

function effectiveDifficulty(ctx: QuestionContext): Difficulty {
  if (ctx.difficulty !== 'adaptive') return ctx.difficulty
  const recent = ctx.previousAnswers.slice(-2)
  if (!recent.length) return 'medium'
  const avg = recent.reduce((sum, r) => sum + r.score, 0) / recent.length
  if (avg >= 78) return ctx.questionNumber <= 2 ? 'medium' : 'hard'
  if (avg >= 55) return 'medium'
  return 'easy'
}

function pickType(ctx: QuestionContext): QuestionType {
  const index = ctx.questionNumber - 1
  const cycle: QuestionType[] =
    ctx.interviewType === 'technical'
      ? ['technical', 'resume', 'technical', 'situational', 'technical']
      : ctx.interviewType === 'behavioral'
        ? ['behavioral', 'situational', 'resume', 'behavioral']
        : ctx.interviewType === 'hr'
          ? ['hr', 'behavioral', 'resume', 'hr']
          : ['resume', 'technical', 'behavioral', 'technical', 'situational', 'hr']
  // First question is always a warm-up the candidate can answer well.
  if (index === 0) return ctx.interviewType === 'hr' ? 'hr' : 'resume'
  return cycle[index % cycle.length] ?? 'technical'
}

function resumeAnchored(ctx: QuestionContext, difficulty: Difficulty): GeneratedQuestion | null {
  const resume = ctx.resume
  if (!resume) return null
  const projects = resume.projects.filter((p) => !ctx.askedQuestions.some((q) => similarity(q, p.name) > 0.5))
  const roles = [...resume.experience, ...resume.internships].filter(
    (r) => !ctx.askedQuestions.some((q) => similarity(q, `${r.role} ${r.company}`) > 0.5),
  )

  const candidates: GeneratedQuestion[] = []
  for (const project of projects.slice(0, 4)) {
    const technologies = project.technologies.slice(0, 3)
    const variants: Record<Difficulty, string> = {
      easy: `I see "${project.name}" in your projects. Give me a quick overview — what problem does it solve and what was your part in it?`,
      medium: `Tell me how you built "${project.name}". Walk me through your architecture and the decisions you made along the way.`,
      hard: `In "${project.name}", what was the hardest technical constraint you had to work around, and how would you design it differently today?`,
    }
    candidates.push({
      question: `${variants[difficulty]}${technologies.length ? ` (Technologies listed: ${technologies.join(', ')})` : ''}`,
      type: 'resume',
      difficulty,
      expected_topics: technologies.length ? [...technologies, 'architecture', 'your specific contribution'] : ['architecture', 'your specific contribution', 'outcome'],
      resume_anchor: project.name,
      is_follow_up: false,
    })
  }
  for (const role of roles.slice(0, 3)) {
    const label = [role.role, role.company].filter(Boolean).join(' at ') || 'your recent experience'
    candidates.push({
      question:
        difficulty === 'easy'
          ? `You mentioned ${label}. What were you responsible for day to day?`
          : `In your role as ${label}, which technical decision are you most proud of, and what alternatives did you consider?`,
      type: 'resume',
      difficulty,
      expected_topics: ['responsibilities', 'technical decisions', 'impact', 'collaboration'],
      resume_anchor: label,
      is_follow_up: false,
    })
  }
  const viable = candidates.filter((c) => !isDuplicate(c.question, ctx.askedQuestions))
  if (!viable.length) return null
  return viable[Math.floor(Math.random() * viable.length)] ?? null
}

function skillTechnicalQuestion(ctx: QuestionContext, difficulty: Difficulty): GeneratedQuestion | null {
  const skills = normalizeSkillList([
    ...(ctx.job?.required_skills ?? []),
    ...(ctx.resume?.technical_skills ?? []).slice(0, 12),
  ], 30)
  const uncoveredSkills = skills.filter(
    (skill) =>
      !ctx.askedTopics.some((topic) => similarity(topic, skill) > 0.7) &&
      !alreadyMentioned(skill, ctx.askedQuestions) &&
      !isDuplicate(skill, ctx.askedQuestions),
  )
  const ordered = [...uncoveredSkills].sort(() => Math.random() - 0.5)

  for (const skill of ordered) {
    const bankItem = bankItemFor(skill, difficulty)
    if (bankItem && !isDuplicate(bankItem.q, ctx.askedQuestions)) {
      return {
        question: bankItem.q,
        type: 'technical',
        difficulty,
        expected_topics: bankItem.topics,
        resume_anchor: null,
        is_follow_up: false,
      }
    }
    const templates: Record<Difficulty, string> = {
      easy: `What is your experience with ${skill}, and where have you applied it in practice?`,
      medium: `Take me through something you built or worked on that used ${skill}. What decisions did you make and why?`,
      hard: `How would you use ${skill} in a production system, and what trade-offs or failure modes would you plan for?`,
    }
    const question = templates[difficulty]
    if (!isDuplicate(question, ctx.askedQuestions)) {
      return {
        question,
        type: 'technical',
        difficulty,
        expected_topics: [skill, 'practical application', 'trade-offs', 'outcome'],
        resume_anchor: null,
        is_follow_up: false,
      }
    }
  }
  return null
}

function domainOrBankQuestion(ctx: QuestionContext, difficulty: Difficulty, type: QuestionType): GeneratedQuestion | null {
  const domain = ctx.job?.domain ?? 'general software'
  const bank = DOMAIN_BANK[domain] ?? DOMAIN_BANK['general software']!
  const pools: Bank[] = []
  if (type === 'behavioral') pools.push(BEHAVIORAL_BANK)
  else if (type === 'hr') pools.push(HR_BANK)
  else if (type === 'situational') pools.push(SITUATIONAL_BANK)
  else {
    pools.push(bank)
    if (ctx.interviewType === 'mixed') pools.push(BEHAVIORAL_BANK)
  }
  for (const pool of pools) {
    const items = [...(pool[difficulty] ?? []), ...(pool.medium ?? []), ...(pool.easy ?? [])]
    const viable = items.filter((item) => !isDuplicate(item.q, ctx.askedQuestions))
    if (viable.length) {
      const chosen = viable[Math.floor(Math.random() * viable.length)]!
      return {
        question: chosen.q,
        type,
        difficulty,
        expected_topics: chosen.topics,
        resume_anchor: null,
        is_follow_up: false,
      }
    }
  }
  return null
}

/** True when the concept already appears verbatim in a question we have asked. */
function alreadyMentioned(concept: string, askedQuestions: string[]): boolean {
  const needle = concept.trim().toLowerCase()
  if (needle.length < 3) return false
  return askedQuestions.some((question) => question.toLowerCase().includes(needle))
}

/** Candidate-selected focus areas are asked first, so the setup screen has a visible effect. */
function focusAreaQuestion(ctx: QuestionContext, difficulty: Difficulty): GeneratedQuestion | null {
  const areas = (ctx.focusAreas ?? []).filter(Boolean)
  if (!areas.length) return null
  for (const area of areas) {
    if (ctx.askedTopics.some((topic) => similarity(topic, area) > 0.7)) continue
    if (alreadyMentioned(area, ctx.askedQuestions)) continue
    const bankItem = bankItemFor(area, difficulty)
    if (bankItem && !isDuplicate(bankItem.q, ctx.askedQuestions)) {
      return {
        question: bankItem.q,
        type: 'technical',
        difficulty,
        expected_topics: bankItem.topics,
        resume_anchor: null,
        is_follow_up: false,
      }
    }
    const templates: Record<Difficulty, string> = {
      easy: `You listed ${area} as a focus area. What is your experience with it so far?`,
      medium: `Let's focus on ${area}. Walk me through something you built with it and the decisions you made.`,
      hard: `Let's go deep on ${area}: how would you use it in a production system, and what failure modes would you plan for?`,
    }
    const question = templates[difficulty]
    if (!isDuplicate(question, ctx.askedQuestions)) {
      return {
        question,
        type: 'technical',
        difficulty,
        expected_topics: [area, 'practical application', 'trade-offs', 'outcome'],
        resume_anchor: null,
        is_follow_up: false,
      }
    }
  }
  return null
}

export function generateQuestionLocally(ctx: QuestionContext): GeneratedQuestion {
  const difficulty = effectiveDifficulty(ctx)
  // The blueprint decides the type when the validation pipeline supplies one; otherwise rotate by index.
  const blueprintType = ctx.blueprint?.target_type as QuestionType | undefined
  const type = blueprintType && blueprintType !== 'follow_up' ? blueprintType : pickType(ctx)

  // Anchors the blueprint selected (a named project, a role, a required skill) are tried first so the
  // question matches the intent the pipeline validated against.
  const anchoredCtx: QuestionContext = ctx.blueprint?.resume_anchors?.length
    ? { ...ctx, focusAreas: [...(ctx.blueprint.resume_anchors ?? []), ...(ctx.focusAreas ?? [])] }
    : ctx

  const order: (() => GeneratedQuestion | null)[] = []
  if (ctx.blueprint?.must_cover_from_job?.length && type === 'technical') {
    order.push(() => skillTechnicalQuestion({ ...anchoredCtx, focusAreas: ctx.blueprint!.must_cover_from_job }, difficulty))
  }
  if (ctx.focusAreas?.length && type !== 'hr') order.push(() => focusAreaQuestion(anchoredCtx, difficulty))
  if (type === 'resume' || type === 'technical') order.push(() => resumeAnchored(anchoredCtx, difficulty))
  if (type === 'technical') order.push(() => skillTechnicalQuestion(anchoredCtx, difficulty))
  order.push(() => domainOrBankQuestion(anchoredCtx, difficulty, type))
  order.push(() => {
    // last resort: the broadest bank, ignoring de-duplication pressure from topics
    const relaxed = { ...ctx, askedQuestions: ctx.askedQuestions.slice(-2) }
    return domainOrBankQuestion(relaxed, 'medium', ctx.interviewType === 'hr' ? 'hr' : 'technical')
  })

  for (const attempt of order) {
    const result = attempt()
    if (result) return { ...result, difficulty }
  }

  return {
    question: `Tell me about a recent technical challenge in a ${ctx.jobRole} context: what was the situation, what did you do, and what was the outcome?`,
    type: 'behavioral',
    difficulty,
    expected_topics: ['situation', 'your actions', 'technology', 'result'],
    resume_anchor: null,
    is_follow_up: false,
  }
}

/** Turns an uncovered topic into a natural interviewer probe. */
function probePhrasing(topic: string, brief: boolean): string {
  const key = topic.toLowerCase()
  if (/contribution|your role|responsibilit|specific/.test(key))
    return brief
      ? 'Which parts of that did you personally build, and how would you split the work today?'
      : 'You described the project — what exactly did you own yourself, and what was someone else\u2019s contribution?'
  if (/architecture|design|structure/.test(key))
    return 'How was that structured? Walk me through the components and how data moved between them.'
  if (/trade-?off|decision|alternative/.test(key))
    return 'What alternative did you consider there, and why did you go the other way?'
  if (/metric|evaluation|accuracy|precision|recall/.test(key))
    return 'How did you measure whether that actually worked, and what number did you see?'
  if (/testing|deployment|monitoring|observability/.test(key))
    return 'How did you verify it in production — what did you test, deploy or monitor?'
  if (/outcome|result|impact/.test(key))
    return 'What was the concrete outcome, ideally with a number attached?'
  return brief
    ? `Let me push a little there — can you expand on ${topic}, with a specific example from your own work?`
    : `You touched on your approach — how exactly did you deal with ${topic}?`
}

/** Deterministic probe used when the semantic provider is unavailable. */
export function generateFollowUpLocally(
  ctx: EvaluationContext & {
    evaluation: { coverage: { topic: string; covered: boolean }[] }
    askedQuestions?: string[]
  },
): { question: string; expected_topics: string[]; reason: string } | null {
  const asked = ctx.askedQuestions ?? []
  // Never probe the same topic twice: pick the first missed topic that has not already been probed.
  const missed = ctx.evaluation.coverage
    .filter((c) => !c.covered)
    .map((c) => c.topic)
    .filter((topic) => {
      const probe = probePhrasing(topic, false)
      return !asked.some((previous) => similarity(previous, probe) > 0.55 || similarity(previous, topic) > 0.6)
    })
  if (!missed.length) return null
  const topic = missed[0] ?? 'your approach'
  const wordCount = (ctx.answer ?? '').split(/\s+/).filter(Boolean).length
  const brief = wordCount < 25
  return {
    question: probePhrasing(topic, brief),
    expected_topics: brief ? [topic, 'concrete example', 'outcome'] : [topic, 'implementation detail', 'trade-offs'],
    reason: brief
      ? 'Your previous answer was brief; this probes for depth on an uncovered point.'
      : 'Probing an expected topic your previous answer skipped.',
  }
}
