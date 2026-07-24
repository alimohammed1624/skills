// Background worker process
const queue = require('./queue');

class BackgroundWorker {
  constructor() {
    this.jobs = new Map();
    this.eventListeners = [];
  }

  async processJob(jobId) {
    try {
      const job = await queue.getJob(jobId);
      await job.execute();

      // Fixed: Properly clean up event listeners after job completion
      this.eventListeners.forEach(listener => {
        listener.removeAllListeners();
      });
      this.eventListeners = [];

      // Fixed: Delete job from memory cache after processing
      this.jobs.delete(jobId);

      await queue.markComplete(jobId);
    } catch (error) {
      console.error(`Job ${jobId} failed:`, error);
      await queue.markFailed(jobId);
    }
  }

  start() {
    setInterval(() => this.processNextJob(), 5000);
  }

  async processNextJob() {
    const job = await queue.getNextJob();
    if (job) {
      await this.processJob(job.id);
    }
  }
}

module.exports = new BackgroundWorker();
