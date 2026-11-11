import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
const base = repo && repo.toLowerCase() !== `${owner.toLowerCase()}.github.io` ? `/${repo}/` : '/';

export default defineConfig({ plugins: [react()], base });
