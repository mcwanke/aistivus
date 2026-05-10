const AIstivusUtils = {
  _timezone: null,

  async getTimezone() {
    if (this._timezone) return this._timezone;
    try {
      const res  = await fetch('/api/settings');
      const data = await res.json();
      this._timezone = data.timezone || 'UTC';
    } catch {
      this._timezone = 'UTC';
    }
    return this._timezone;
  },

  async formatDate(isoString) {
    const tz = await this.getTimezone();
    if (!isoString) return '—';
    return new Date(isoString).toLocaleDateString('en-US', {
      timeZone: tz,
      month: 'short', day: 'numeric', year: 'numeric'
    });
  },

  async formatDateShort(isoString) {
    const tz = await this.getTimezone();
    if (!isoString) return '—';
    return new Date(isoString).toLocaleDateString('en-US', {
      timeZone: tz,
      month: 'short', day: 'numeric'
    });
  },

  async formatDateTime(isoString) {
    const tz = await this.getTimezone();
    if (!isoString) return '—';
    return new Date(isoString).toLocaleString('en-US', {
      timeZone: tz,
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }
};
