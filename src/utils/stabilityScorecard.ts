export const stabilityScorecard = {
  isCertified: false,
  generatedAt: null as string | null,
  buildHash: null as string | null,
  environment: null as string | null,
  
  websocketStability: 0,
  monacoStability: 0,
  saveIntegrity: 0,
  executionIntegrity: 0,
  offlineRecoverySuccesses: 0,
  iframeCleanupSuccesses: 0,
  
  recordSuccess(metric: keyof Omit<typeof stabilityScorecard, 'recordSuccess' | 'getReport' | 'certifyRelease'>) {
    if (this.isCertified) {
      console.warn('[SCORECARD] Cannot mutate a certified scorecard.');
      return;
    }
    if (typeof this[metric] === 'number') {
      (this as any)[metric]++;
    }
  },

  getReport() {
    return {
      websocketStability: this.websocketStability,
      monacoStability: this.monacoStability,
      saveIntegrity: this.saveIntegrity,
      executionIntegrity: this.executionIntegrity,
      offlineRecoverySuccesses: this.offlineRecoverySuccesses,
      iframeCleanupSuccesses: this.iframeCleanupSuccesses,
      isCertified: this.isCertified,
      generatedAt: this.generatedAt,
      buildHash: this.buildHash,
      environment: this.environment
    };
  },

  certifyRelease() {
    if (this.isCertified) return;
    this.isCertified = true;
    this.generatedAt = new Date().toISOString();
    this.buildHash = import.meta.env.VITE_BUILD_ID || 'dev-local';
    this.environment = import.meta.env.MODE;
    
    // Lock the object deeply to prevent future mutations
    Object.freeze(this);
    console.log('[SCORECARD] Certification locked and sealed.');
  }
};
