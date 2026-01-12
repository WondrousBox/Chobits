import pkg from '../../../package.json';

export const SERVICE = `${pkg.name.toLowerCase()}-ai`;

export const DOWNLOAD_FOLDER_NAME = `${pkg.name}Downloads`;

// Instance-level secrets (stored with different service id to avoid clash)
export const SERVICE_INST = `${pkg.name.toLowerCase()}-ai-instance`;
