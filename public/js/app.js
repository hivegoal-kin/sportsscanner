// AG Grid Configuration
let gridApi;
let gridColumnApi;
let rowData = [];
let expandedGroups = {};
let allMatchData = [];
let previousValues = {};
let updateInterval = null;
let isLoading = false;

// Column Definitions
const columnDefs = [
    {
        headerName: 'Match',
        field: 'match',
        width: 220,
        pinned: null,
        minWidth: 170,
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                const isExpanded = expandedGroups[params.data.league] !== false;
                return `<div class="league-group-header-full" data-league="${params.data.league}" data-group="true">
                    ${params.data.league} <span class="league-count">(${params.data.groupCount})</span>
                </div>`;
            }
            const data = params.data;
            const homeTeam = data.home_team || '—';
            const awayTeam = data.away_team || '—';
            return `<div class="cell-container-dual-row" style="display:flex;flex-direction:column;align-items:flex-start;width:100%;">
                <div class="cell-row team-home" style="display:flex;justify-content:flex-start;width:100%;">${homeTeam}</div>
                <div class="cell-row team-away" style="display:flex;justify-content:flex-start;width:100%;">${awayTeam}</div>
            </div>`;
        }
    },
    {
        headerName: 'HT',
        field: 'ht_score',
        width: 55,
        pinned: null,
        minWidth: 45,
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value || '0-0';
            const parts = String(val).split('-');
            return `<div class="cell-container-dual-row">
                <div class="cell-row ht-home">${parts[0] || '0'}</div>
                <div class="cell-row ht-away">${parts[1] || '0'}</div>
            </div>`;
        }
    },
    {
        headerName: 'Score',
        field: 'score',
        width: 70,
        pinned: null,
        minWidth: 60,
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value || '0-0';
            const parts = String(val).split('-');
            const homeScore = parseInt(parts[0]) || 0;
            const awayScore = parseInt(parts[1]) || 0;
            const isUpdated = params.data && params.data._updated === true;

            let homeBold = '';
            let awayBold = '';
            if (homeScore > awayScore) {
                homeBold = 'bold';
            } else if (awayScore > homeScore) {
                awayBold = 'bold';
            }

            return `<div class="cell-container-dual-row">
                <div class="cell-row score-home ${homeBold} ${isUpdated ? 'value-updated' : ''}">${homeScore}</div>
                <div class="cell-row score-away ${awayBold} ${isUpdated ? 'value-updated' : ''}">${awayScore}</div>
            </div>`;
        }
    },
    {
        headerName: 'Time',
        field: 'timer',
        width: 55,
        pinned: null,
        minWidth: 50,
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value || '—';
            const isUpdated = params.data && params.data._timerUpdated === true;
            let timerClass = '';

            // Apply different styles based on match state
            if (params.data) {
                if (params.data.is_upcoming) {
                    timerClass = 'timer-upcoming';
                } else if (params.data.is_live) {
                    timerClass = 'timer-live';
                } else {
                    timerClass = 'timer-finished';
                }
            }

            return `<div class="cell-row-double timer-value ${timerClass} ${isUpdated ? 'value-updated' : ''}">${val}</div>`;
        }
    },
    {
        headerName: 'Momentum',
        field: 'momentum',
        width: 160,
        minWidth: 100,
        hide: false,
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }

            const momentumData = params.value;

            if (!momentumData || !Array.isArray(momentumData) || momentumData.length === 0) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty" style="text-align:center;width:100%;">—</div>
                <div class="cell-row stat-empty" style="text-align:center;width:100%;">—</div>
            </div>`;
            }

            let maxVal = 0;
            let latestValue = 0;
            let latestMinute = 0;

            momentumData.forEach(item => {
                const absVal = Math.abs(item.v);
                if (absVal > maxVal) maxVal = absVal;
                if (item.m > latestMinute) {
                    latestMinute = item.m;
                    latestValue = item.v;
                }
            });
            maxVal = Math.max(maxVal, 20);

            const match = params.data;
            const currentMinute = Math.min(90, Math.floor(parseInt(match?.timer) || latestMinute || 0));

            // ALWAYS USE FULL 0-90 MINUTES
            const totalMinutes = 90;

            const width = 100;
            const height = 40;
            const padding = 2;
            const chartWidth = width - (padding * 2);
            const chartHeight = height - (padding * 2);

            let points = [];

            // Build points for FULL 0-90 minutes
            for (let m = 0; m <= totalMinutes; m++) {
                let value = 0;
                let hasData = false;

                // Check if we have data for this minute
                const items = momentumData.filter(item => Math.floor(item.m) === m);
                if (items.length > 0) {
                    const sum = items.reduce((a, b) => a + b.v, 0);
                    value = sum / items.length;
                    hasData = true;
                } else {
                    // Try interpolation from surrounding data
                    const prev = momentumData.filter(item => Math.floor(item.m) < m);
                    const next = momentumData.filter(item => Math.floor(item.m) > m);
                    if (prev.length > 0 && next.length > 0) {
                        const prevVal = prev[prev.length - 1].v;
                        const nextVal = next[0].v;
                        const prevMin = Math.floor(prev[prev.length - 1].m);
                        const nextMin = Math.floor(next[0].m);
                        if (nextMin > prevMin) {
                            const ratio = (m - prevMin) / (nextMin - prevMin);
                            value = prevVal + (nextVal - prevVal) * ratio;
                            hasData = true;
                        }
                    } else if (prev.length > 0) {
                        value = prev[prev.length - 1].v;
                        hasData = true;
                    } else if (next.length > 0) {
                        value = next[0].v;
                        hasData = true;
                    }
                }

                // Only show data up to current minute, future is extrapolated (dimmed)
                const x = padding + (m / totalMinutes) * chartWidth;
                const y = (height / 2) - (value / maxVal) * (chartHeight / 2);
                points.push({ x, y, value, hasData });
            }

            const centerY = height / 2;

            // Build segments with colors - BLUE for positive, RED for negative
            let segments = [];
            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];

                // Only show line up to current minute, future is dimmed
                const isPast = (i / points.length) * 90 <= currentMinute;
                const avgValue = (p1.value + p2.value) / 2;
                const color = avgValue >= 0 ? '#1a73e8' : '#ea4335';

                segments.push({
                    x1: p1.x,
                    y1: p1.y,
                    x2: p2.x,
                    y2: p2.y,
                    color: color,
                    opacity: isPast ? 1 : 0.2
                });
            }

            // Build area path (only up to current minute)
            let areaPath = '';
            const lastIndex = Math.min(points.length - 1, Math.floor((currentMinute / 90) * points.length));

            points.forEach((p, i) => {
                if (i === 0) {
                    areaPath += `M ${p.x} ${centerY} L ${p.x} ${p.y}`;
                } else if (i <= lastIndex) {
                    areaPath += ` L ${p.x} ${p.y}`;
                }
            });
            if (lastIndex > 0) {
                areaPath += ` L ${points[lastIndex].x} ${centerY} Z`;
            }

            // Area color based on latest value
            const areaColor = latestValue >= 0 ? 'rgba(26, 115, 232, 0.15)' : 'rgba(234, 67, 53, 0.15)';

            // Calculate marker position
            const markerX = padding + (currentMinute / totalMinutes) * chartWidth;

            // Build segments HTML with opacity for future
            let segmentsHtml = segments.map(seg => {
                return `<line x1="${seg.x1}" y1="${seg.y1}" x2="${seg.x2}" y2="${seg.y2}" stroke="${seg.color}" stroke-width="1.5" stroke-linecap="round" opacity="${seg.opacity}" />`;
            }).join('');

            // Determine if latest value is positive or negative
            const isPositive = latestValue >= 0;

            return `<div class="momentum-sparkline">
            <svg width="100%" height="45" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
                <!-- Area fill -->
                <path d="${areaPath}" fill="${areaColor}" />
                <!-- Colored segments -->
                ${segmentsHtml}
                <!-- Center line -->
                <line x1="${padding}" y1="${centerY}" x2="${width - padding}" y2="${centerY}" stroke="#e8eaed" stroke-width="0.5" stroke-dasharray="2,2" />
                <!-- End dot -->
                ${points.length > 0 && latestMinute > 0 ? `<circle cx="${points[Math.min(points.length - 1, Math.floor((currentMinute / 90) * points.length))].x}" cy="${points[Math.min(points.length - 1, Math.floor((currentMinute / 90) * points.length))].y}" r="2.5" fill="${isPositive ? '#1a73e8' : '#ea4335'}" />` : ''}
                <!-- Current value label -->
                <text x="${width - 10}" y="10" font-size="6" fill="${isPositive ? '#1a73e8' : '#ea4335'}" font-weight="bold" text-anchor="end">${latestValue > 0 ? '+' : ''}${latestValue}</text>
                <!-- MOVING MARKER -->
                <line x1="${markerX}" y1="${padding}" x2="${markerX}" y2="${height - padding}" stroke="#5f6368" stroke-width="1" stroke-dasharray="2,2" opacity="0.5" />
                <text x="${markerX}" y="${padding + 2}" font-size="5" fill="#5f6368" font-weight="bold" text-anchor="middle">${currentMinute}'</text>
            </svg>
        </div>`;
        }
    },
    {
        headerName: 'xG',
        field: 'xg',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Expected Goals',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            // ✅ Check if xG data exists
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._xgUpdated === true;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${homeVal > awayVal ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${Number(homeVal).toFixed(2)}</div>
            <div class="cell-row ${awayVal > homeVal ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${Number(awayVal).toFixed(2)}</div>
        </div>`;
        }
    },
    {
        headerName: 'Sht',
        field: 'shots',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Total Shots',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._shotsUpdated === true;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${homeVal > awayVal ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
            <div class="cell-row ${awayVal > homeVal ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
        </div>`;
        }
    },
    {
        headerName: 'SoT',
        field: 'shots_on_target',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Shots on Target',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            // ✅ Check if SOT data exists
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._sotUpdated === true;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${homeVal > awayVal ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
            <div class="cell-row ${awayVal > homeVal ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
        </div>`;
        }
    },
    {
        headerName: 'BSh',
        field: 'blocked_shots',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Blocked Shots',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._blockedShotsUpdated === true;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${homeVal > awayVal ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
            <div class="cell-row ${awayVal > homeVal ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
        </div>`;
        }
    },
    {
        headerName: 'Cor',
        field: 'corners',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Corners',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || typeof val !== 'object') {
                return `<div class="cell-container-dual-row"><div class="cell-row stat-empty">—</div></div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._cornersUpdated === true;
            return `<div class="cell-container-dual-row">
                <div class="cell-row ${homeVal > awayVal ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
                <div class="cell-row ${awayVal > homeVal ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
            </div>`;
        }
    },
    // ✅ FREE KICKS
    {
        headerName: 'FrK',
        field: 'free_kicks',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Free Kicks',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._freeKicksUpdated === true;
            const isHomeLeading = homeVal > awayVal;
            const isAwayLeading = awayVal > homeVal;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${isHomeLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
            <div class="cell-row ${isAwayLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
        </div>`;
        }
    },
    // ✅ THROW-INS
    {
        headerName: 'TI',
        field: 'throw_ins',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        maxWidth: 100,
        headerTooltip: 'Throw-ins',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._throwInsUpdated === true;
            const isHomeLeading = homeVal > awayVal;
            const isAwayLeading = awayVal > homeVal;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${isHomeLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
            <div class="cell-row ${isAwayLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
        </div>`;
        }
    },
    // ✅ GOAL KICKS
    {
        headerName: 'GKi',
        field: 'goal_kicks',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Goal Kicks',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._goalKicksUpdated === true;
            const isHomeLeading = homeVal > awayVal;
            const isAwayLeading = awayVal > homeVal;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${isHomeLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
            <div class="cell-row ${isAwayLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
        </div>`;
        }
    },
    {
        headerName: 'Att',
        field: 'attacks',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Attacks',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._attacksUpdated === true;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${homeVal > awayVal ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
            <div class="cell-row ${awayVal > homeVal ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
        </div>`;
        }
    },
    {
        headerName: 'DA',
        field: 'dangerous_attacks',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Dangerous Attacks',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._dangerousAttacksUpdated === true;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${homeVal > awayVal ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
            <div class="cell-row ${awayVal > homeVal ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
        </div>`;
        }
    },
    {
        headerName: 'Pos',
        field: 'possession',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Possessions',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;

            // ✅ Check if possession data exists
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }

            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._possessionUpdated === true;

            const isHomeLeading = homeVal > awayVal;
            const isAwayLeading = awayVal > homeVal;

            return `<div class="cell-container-dual-row">
            <div class="cell-row ${isHomeLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}%</div>
            <div class="cell-row ${isAwayLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}%</div>
        </div>`;
        }
    },
    {
        headerName: 'Pas',
        field: 'passes',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Total Passes',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._passesUpdated === true;
            const isHomeLeading = homeVal > awayVal;
            const isAwayLeading = awayVal > homeVal;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${isHomeLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
            <div class="cell-row ${isAwayLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
        </div>`;
        }
    },
    // ✅ ACCURATE PASSES
    {
        headerName: 'AP',
        field: 'accurate_passes',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Accurate Passes',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._accuratePassesUpdated === true;
            const isHomeLeading = homeVal > awayVal;
            const isAwayLeading = awayVal > homeVal;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${isHomeLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
            <div class="cell-row ${isAwayLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
        </div>`;
        }
    },
    // ✅ PASS ACCURACY (percentage)
    {
        headerName: 'PA%',
        field: 'pass_accuracy',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Passing Accuracy',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._passAccuracyUpdated === true;
            const isHomeLeading = homeVal > awayVal;
            const isAwayLeading = awayVal > homeVal;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${isHomeLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}%</div>
            <div class="cell-row ${isAwayLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}%</div>
        </div>`;
        }
    },
    {
        headerName: 'TTk',
        field: 'total_tackles',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Total Tackles',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._totalTacklesUpdated === true;
            const isHomeLeading = homeVal > awayVal;
            const isAwayLeading = awayVal > homeVal;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${isHomeLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
            <div class="cell-row ${isAwayLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
        </div>`;
        }
    },
    // ✅ TACKLES WON
    {
        headerName: 'TW',
        field: 'tackles_won',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Tackles Won',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._tacklesWonUpdated === true;
            const isHomeLeading = homeVal > awayVal;
            const isAwayLeading = awayVal > homeVal;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${isHomeLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
            <div class="cell-row ${isAwayLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
        </div>`;
        }
    },
    // ✅ INTERCEPTIONS
    {
        headerName: 'Int',
        field: 'interceptions',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Interceptions',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._interceptionsUpdated === true;
            const isHomeLeading = homeVal > awayVal;
            const isAwayLeading = awayVal > homeVal;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${isHomeLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
            <div class="cell-row ${isAwayLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
        </div>`;
        }
    },
    // ✅ CLEARANCES
    {
        headerName: 'Clr',
        field: 'clearances',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Clearances',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._clearancesUpdated === true;
            const isHomeLeading = homeVal > awayVal;
            const isAwayLeading = awayVal > homeVal;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${isHomeLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
            <div class="cell-row ${isAwayLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
        </div>`;
        }
    },
    // ✅ DUELS
    {
        headerName: 'Duels',
        field: 'duels',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Total Duels',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._duelsUpdated === true;
            const isHomeLeading = homeVal > awayVal;
            const isAwayLeading = awayVal > homeVal;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${isHomeLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
            <div class="cell-row ${isAwayLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
        </div>`;
        }
    },
    // ✅ AERIAL DUELS
    {
        headerName: 'ADuels',
        field: 'aerial_duels',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Aerial Duels',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._aerialDuelsUpdated === true;
            const isHomeLeading = homeVal > awayVal;
            const isAwayLeading = awayVal > homeVal;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${isHomeLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
            <div class="cell-row ${isAwayLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
        </div>`;
        }
    },
    // ✅ GK SAVES
    {
        headerName: 'GKS',
        field: 'gk_saves',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Goalkeeper Saves',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._gkSavesUpdated === true;
            const isHomeLeading = homeVal > awayVal;
            const isAwayLeading = awayVal > homeVal;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${isHomeLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
            <div class="cell-row ${isAwayLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
        </div>`;
        }
    },
    // ✅ BIG SAVES
    {
        headerName: 'BigS',
        field: 'big_saves',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Big Saves',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._bigSavesUpdated === true;
            const isHomeLeading = homeVal > awayVal;
            const isAwayLeading = awayVal > homeVal;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${isHomeLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
            <div class="cell-row ${isAwayLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
        </div>`;
        }
    },
    // ✅ GOALS PREVENTED
    {
        headerName: 'GP',
        field: 'goals_prevented',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Goals Prevented',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._goalsPreventedUpdated === true;
            const isHomeLeading = homeVal > awayVal;
            const isAwayLeading = awayVal > homeVal;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${isHomeLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
            <div class="cell-row ${isAwayLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
        </div>`;
        }
    },
    // ✅ FOULS
    {
        headerName: 'Fouls',
        field: 'fouls',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Fouls',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || val.home === null || val.home === undefined || val.away === null || val.away === undefined) {
                return `<div class="cell-container-dual-row">
                <div class="cell-row stat-empty">—</div>
                <div class="cell-row stat-empty">—</div>
            </div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._foulsUpdated === true;
            const isHomeLeading = homeVal > awayVal;
            const isAwayLeading = awayVal > homeVal;
            return `<div class="cell-container-dual-row">
            <div class="cell-row ${isHomeLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
            <div class="cell-row ${isAwayLeading ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
        </div>`;
        }
    },
    {
        headerName: 'YelC',
        field: 'yellow_cards',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Yellow Cards',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || typeof val !== 'object') {
                return `<div class="cell-container-dual-row"><div class="cell-row stat-empty">—</div></div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._ycUpdated === true;
            return `<div class="cell-container-dual-row">
                <div class="cell-row ${homeVal > awayVal ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
                <div class="cell-row ${awayVal > homeVal ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
            </div>`;
        }
    },
    {
        headerName: 'RedC',
        field: 'red_cards',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Red Cards',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || typeof val !== 'object') {
                return `<div class="cell-container-dual-row"><div class="cell-row stat-empty">—</div></div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._rcUpdated === true;
            return `<div class="cell-container-dual-row">
                <div class="cell-row ${homeVal > 0 ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
                <div class="cell-row ${awayVal > 0 ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
            </div>`;
        }
    },
    {
        headerName: 'Subs',
        field: 'substitutions',
        width: 50,
        maxWidth: 100,
        minWidth: 45,
        hide: false,
        headerTooltip: 'Substitution',
        cellRenderer: params => {
            if (params.data && params.data.isGroupHeader) {
                return `<div class="league-group-spacer"></div>`;
            }
            const val = params.value;
            if (!val || typeof val !== 'object') {
                return `<div class="cell-container-dual-row"><div class="cell-row stat-empty">—</div></div>`;
            }
            const homeVal = val.home || 0;
            const awayVal = val.away || 0;
            const isUpdated = params.data && params.data._subsUpdated === true;
            return `<div class="cell-container-dual-row">
                <div class="cell-row ${homeVal > awayVal ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${homeVal}</div>
                <div class="cell-row ${awayVal > homeVal ? 'stat-lead' : ''} ${isUpdated ? 'value-updated' : ''}">${awayVal}</div>
            </div>`;
        }
    }
];

// Grid Options
const gridOptions = {
    columnDefs: columnDefs,
    rowData: [],
    pagination: false,
    rowSelection: 'null',
    suppressRowClickSelection: true,
    enableCellTextSelection: true,
    ensureDomOrder: true,
    suppressCellFocus: true,
    animateRows: true,
    enableHorizontalScroll: true,
    enableColResize: true,
    pinnedLeftCount: 0,
    rowHeight: 52,
    getRowId: params => params.data.id || Math.random().toString(36),
    defaultColDef: {
        sortable: false,
        filter: false,
        resizable: true,
        minWidth: 35,
        hide: false,
    },
    onGridReady: function (params) {
        gridApi = params.api;
        gridColumnApi = params.columnApi;

        // Load data from API
        fetchMatches();

        setTimeout(() => {
            gridApi.sizeColumnsToFit();
        }, 500);
    }
};

// Current date range
let currentDateFrom = null;
let currentDateTo = null;
let currentStatus = 'all';

async function fetchMatches(dateFrom, dateTo, status) {
    if (isLoading) return;
    isLoading = true;

    console.log('========================================');
    console.log('📅 FETCH MATCHES CALLED');
    console.log('📅 Date From:', dateFrom);
    console.log('📅 Date To:', dateTo);
    console.log('📅 Status:', status);
    console.log('========================================');

    const liveCount = document.getElementById('liveCount');
    if (liveCount) liveCount.textContent = '...';

    clearNoMatchesMessage();

    try {
        let url = '/api/events?';
        const params = [];

        let fromDate = dateFrom;
        let toDate = dateTo;

        if (!fromDate && !toDate) {
            const today = new Date();
            fromDate = today.toISOString().split('T')[0];
            toDate = today.toISOString().split('T')[0];
            console.log('📅 No date provided - using today:', fromDate);
        }

        if (fromDate) {
            params.push(`date_from=${fromDate}`);
            currentDateFrom = fromDate;
        }
        if (toDate) {
            params.push(`date_to=${toDate}`);
            currentDateTo = toDate;
        }
        if (status && status !== 'all') {
            params.push(`status=${status}`);
            currentStatus = status;
        }

        url += params.join('&');

        console.log('🔗 FULL URL:', url);

        const response = await fetch(url);
        const events = await response.json();

        let eventArray = [];
        if (Array.isArray(events)) {
            eventArray = events;
        } else if (events && typeof events === 'object') {
            if (events.events && Array.isArray(events.events)) {
                eventArray = events.events;
            } else if (events.results && Array.isArray(events.results)) {
                eventArray = events.results;
            } else {
                for (const key in events) {
                    if (Array.isArray(events[key])) {
                        eventArray = events[key];
                        break;
                    }
                }
            }
        }

        console.log(`📊 Found ${eventArray.length} events for ${fromDate}`);

        if (eventArray.length === 0) {
            console.warn(`⚠️ No matches found for ${fromDate}`);
            allMatchData = [];
            rowData = [];
            gridApi.setRowData([]);
            updateCounts([]);
            updateDateRangeLabel(fromDate, toDate);
            showNoMatchesMessage(fromDate);

            // Still update the date label
            const dateLabel = document.getElementById('dateRangeLabel');
            if (dateLabel) {
                const displayDate = new Date(fromDate + 'T00:00:00');
                dateLabel.textContent = displayDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                });
            }

            return;
        }

        const transformedData = transformApiData(eventArray);
        allMatchData = transformedData;
        momentum: event.momentum || [],

        updateDateRangeLabel(fromDate, toDate);
        filterMatches(currentFilter);

        console.log(`✅ Loaded ${transformedData.length} matches for ${fromDate}`);
        console.log('========================================\n');

    } catch (error) {
        console.error('❌ Error fetching matches:', error);
        showErrorMessage(error.message);
        useMockData();
    } finally {
        isLoading = false;
    }
}

// Show no matches message
function showNoMatchesMessage(date) {
    const gridDiv = document.getElementById('inplay-grid');
    if (gridDiv) {
        // Show a message in the grid
        const noDataMessage = document.createElement('div');
        noDataMessage.className = 'no-matches-message';
        noDataMessage.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #5f6368;">
                <i class="fas fa-calendar-day" style="font-size: 40px; margin-bottom: 15px; display: block; color: #dadce0;"></i>
                <h5>No matches found for ${date}</h5>
                <p style="color: #9aa0a6;">Try selecting a different date or check back later.</p>
            </div>
        `;
        // Clear existing grid content and show message
        // Note: This is a fallback, the grid will still show mock data
    }
}

// Transform API data to match our format
function transformApiData(apiEvents) {
    return apiEvents.map((event, index) => {
        // Extract league name
        let leagueName = event.league_name || event.league || event.competition || 'Unknown League';

        if (!leagueName || leagueName === 'Unknown League') {
            if (event.league_id) {
                leagueName = `League ${event.league_id}`;
            } else {
                leagueName = 'Unknown League';
            }
        }

        // Get team names
        const homeTeam = event.home_team || event.homeTeam || event.home || 'Home';
        const awayTeam = event.away_team || event.awayTeam || event.away || 'Away';

        // Get status
        const status = event.status || event.match_status || '';
        const minute = event.current_minute || event.minute || event.time || 0;

        // Determine timer display
        let timer = '—';
        const isLive = status === 'inprogress' || status === '1st_half' || status === '2nd_half' ||
            status === 'halftime' || status === 'HT' ||
            (minute > 0 && minute < 90 && status !== 'finished' && status !== 'FT');

        const isUpcoming = status === 'notstarted' || status === 'scheduled' || status === 'NS';

        if (isUpcoming) {
            const eventDate = event.event_date || event.date;
            if (eventDate) {
                try {
                    const date = new Date(eventDate);
                    if (!isNaN(date.getTime())) {
                        const hours = String(date.getHours()).padStart(2, '0');
                        const minutes = String(date.getMinutes()).padStart(2, '0');
                        timer = `${hours}:${minutes}`;
                    } else {
                        const timeMatch = eventDate.match(/(\d{2}):(\d{2})/);
                        if (timeMatch) {
                            timer = `${timeMatch[1]}:${timeMatch[2]}`;
                        }
                    }
                } catch (e) {
                    const timeMatch = String(eventDate).match(/(\d{2}):(\d{2})/);
                    if (timeMatch) {
                        timer = `${timeMatch[1]}:${timeMatch[2]}`;
                    }
                }
            }
        } else if (status === 'finished' || status === 'fulltime' || status === 'FT') {
            timer = 'FT';
        } else if (status === 'halftime' || status === 'HT') {
            timer = 'HT';
        } else if (status === 'aet' || status === 'after_extra_time' || status === 'AET') {
            timer = 'AET';
        } else if (status === 'penalties' || status === 'PEN') {
            timer = 'PEN';
        } else if (status === 'cancelled') {
            timer = 'CAN';
        } else if (status === 'postponed') {
            timer = 'POS';
        } else if (status === 'delayed') {
            timer = 'DEL';
        } else if (isLive && minute > 0 && minute < 90) {
            timer = `${minute}'`;
        } else if (isLive && minute >= 90) {
            timer = `${minute}'`;
        } else if (minute > 0 && minute < 90) {
            timer = `${minute}'`;
        } else {
            timer = minute > 0 ? `${minute}'` : '—';
        }

        // Get scores
        const homeScore = event.home_score || event.homeScore || event.homescore || 0;
        const awayScore = event.away_score || event.awayScore || event.awayscore || 0;
        const homeScoreHT = event.home_score_ht || event.ht_home_score || event.home_ht || 0;
        const awayScoreHT = event.away_score_ht || event.ht_away_score || event.away_ht || 0;

        // ============================================
        // MOMENTUM - Handle array from API
        // ============================================
        let momentum = [];

        // Check if event has momentum directly
        if (event.momentum) {
            if (Array.isArray(event.momentum)) {
                momentum = event.momentum;
                console.log(`✅ Got momentum array for event ${event.id}, length: ${momentum.length}`);
            } else if (typeof event.momentum === 'object') {
                // If it's an object but not array, try to convert
                if (event.momentum.home !== undefined && event.momentum.away !== undefined) {
                    // It's a home/away object - convert to array format or keep as is
                    momentum = []; // or handle differently
                }
            }
        }

        // If no momentum, try from stats
        if (momentum.length === 0 && event.stats && event.stats.momentum) {
            if (Array.isArray(event.stats.momentum)) {
                momentum = event.stats.momentum;
                console.log(`✅ Got momentum array from stats for event ${event.id}, length: ${momentum.length}`);
            }
        }

        return {
            id: event.id || `event_${index}`,
            league: leagueName,
            home_team: homeTeam,
            away_team: awayTeam,
            match: `${homeTeam} vs ${awayTeam}`,
            score: `${homeScore}-${awayScore}`,
            ht_score: `${homeScoreHT}-${awayScoreHT}`,
            timer: timer,
            momentum: momentum,
            xg: {
                home: event.xg_home !== undefined && event.xg_home !== null ? event.xg_home : null,
                away: event.xg_away !== undefined && event.xg_away !== null ? event.xg_away : null
            },
            shots_on_target: {
                home: event.shots_on_target_home || event.shots_on_target?.home || 0,
                away: event.shots_on_target_away || event.shots_on_target?.away || 0
            },
            shots: {
                home: event.shots_home !== undefined && event.shots_home !== null ? event.shots_home : null,
                away: event.shots_away !== undefined && event.shots_away !== null ? event.shots_away : null
            },
            blocked_shots: {
                home: event.blocked_shots_home !== undefined && event.blocked_shots_home !== null ? event.blocked_shots_home : null,
                away: event.blocked_shots_away !== undefined && event.blocked_shots_away !== null ? event.blocked_shots_away : null
            },
            corners: {
                home: event.corners_home || event.corners?.home || 0,
                away: event.corners_away || event.corners?.away || 0
            },
            free_kicks: {
                home: event.free_kicks_home !== undefined && event.free_kicks_home !== null ? event.free_kicks_home : null,
                away: event.free_kicks_away !== undefined && event.free_kicks_away !== null ? event.free_kicks_away : null
            },
            throw_ins: {
                home: event.throw_ins_home !== undefined && event.throw_ins_home !== null ? event.throw_ins_home : null,
                away: event.throw_ins_away !== undefined && event.throw_ins_away !== null ? event.throw_ins_away : null
            },
            goal_kicks: {
                home: event.goal_kicks_home !== undefined && event.goal_kicks_home !== null ? event.goal_kicks_home : null,
                away: event.goal_kicks_away !== undefined && event.goal_kicks_away !== null ? event.goal_kicks_away : null
            },
            attacks: {
                home: event.attacks_home !== undefined && event.attacks_home !== null ? event.attacks_home : null,
                away: event.attacks_away !== undefined && event.attacks_away !== null ? event.attacks_away : null
            },
            dangerous_attacks: {
                home: event.dangerous_attacks_home !== undefined && event.dangerous_attacks_home !== null ? event.dangerous_attacks_home : null,
                away: event.dangerous_attacks_away !== undefined && event.dangerous_attacks_away !== null ? event.dangerous_attacks_away : null
            },
            possession: {
                home: event.possession_home !== undefined && event.possession_home !== null ? event.possession_home : null,
                away: event.possession_away !== undefined && event.possession_away !== null ? event.possession_away : null
            },
            duels: {
                home: event.duels_home !== undefined && event.duels_home !== null ? event.duels_home : null,
                away: event.duels_away !== undefined && event.duels_away !== null ? event.duels_away : null
            },
            aerial_duels: {
                home: event.aerial_duels_home !== undefined && event.aerial_duels_home !== null ? event.aerial_duels_home : null,
                away: event.aerial_duels_away !== undefined && event.aerial_duels_away !== null ? event.aerial_duels_away : null
            },
            gk_saves: {
                home: event.gk_saves_home !== undefined && event.gk_saves_home !== null ? event.gk_saves_home : null,
                away: event.gk_saves_away !== undefined && event.gk_saves_away !== null ? event.gk_saves_away : null
            },
            big_saves: {
                home: event.big_saves_home !== undefined && event.big_saves_home !== null ? event.big_saves_home : null,
                away: event.big_saves_away !== undefined && event.big_saves_away !== null ? event.big_saves_away : null
            },
            goals_prevented: {
                home: event.goals_prevented_home !== undefined && event.goals_prevented_home !== null ? event.goals_prevented_home : null,
                away: event.goals_prevented_away !== undefined && event.goals_prevented_away !== null ? event.goals_prevented_away : null
            },
            yellow_cards: {
                home: event.yellow_cards_home || event.yellow_cards?.home || 0,
                away: event.yellow_cards_away || event.yellow_cards?.away || 0
            },
            fouls: {
                home: event.fouls_home !== undefined && event.fouls_home !== null ? event.fouls_home : null,
                away: event.fouls_away !== undefined && event.fouls_away !== null ? event.fouls_away : null
            },
            red_cards: {
                home: event.red_cards_home || event.red_cards?.home || 0,
                away: event.red_cards_away || event.red_cards?.away || 0
            },
            fouls: {
                home: event.fouls_home || event.fouls?.home || 0,
                away: event.fouls_away || event.fouls?.away || 0
            },
            offsides: {
                home: event.offsides_home || event.offsides?.home || 0,
                away: event.offsides_away || event.offsides?.away || 0
            },
            saves: {
                home: event.saves_home || event.saves?.home || 0,
                away: event.saves_away || event.saves?.away || 0
            },
            passes: {
                home: event.passes_home !== undefined && event.passes_home !== null ? event.passes_home : null,
                away: event.passes_away !== undefined && event.passes_away !== null ? event.passes_away : null
            },
            accurate_passes: {
                home: event.accurate_passes_home !== undefined && event.accurate_passes_home !== null ? event.accurate_passes_home : null,
                away: event.accurate_passes_away !== undefined && event.accurate_passes_away !== null ? event.accurate_passes_away : null
            },
            pass_accuracy: {
                home: event.pass_accuracy_home !== undefined && event.pass_accuracy_home !== null ? event.pass_accuracy_home : null,
                away: event.pass_accuracy_away !== undefined && event.pass_accuracy_away !== null ? event.pass_accuracy_away : null
            },
            total_tackles: {
                home: event.total_tackles_home !== undefined && event.total_tackles_home !== null ? event.total_tackles_home : null,
                away: event.total_tackles_away !== undefined && event.total_tackles_away !== null ? event.total_tackles_away : null
            },
            tackles_won: {
                home: event.tackles_won_home !== undefined && event.tackles_won_home !== null ? event.tackles_won_home : null,
                away: event.tackles_won_away !== undefined && event.tackles_won_away !== null ? event.tackles_won_away : null
            },
            interceptions: {
                home: event.interceptions_home !== undefined && event.interceptions_home !== null ? event.interceptions_home : null,
                away: event.interceptions_away !== undefined && event.interceptions_away !== null ? event.interceptions_away : null
            },
            clearances: {
                home: event.clearances_home !== undefined && event.clearances_home !== null ? event.clearances_home : null,
                away: event.clearances_away !== undefined && event.clearances_away !== null ? event.clearances_away : null
            },
            crosses: {
                home: event.crosses_home || event.crosses?.home || 0,
                away: event.crosses_away || event.crosses?.away || 0
            },
            passing_accuracy: {
                home: event.passing_accuracy_home || event.passing_accuracy?.home || 0,
                away: event.passing_accuracy_away || event.passing_accuracy?.away || 0
            },
            crossing_accuracy: {
                home: event.crossing_accuracy_home || event.crossing_accuracy?.home || 0,
                away: event.crossing_accuracy_away || event.crossing_accuracy?.away || 0
            },
            free_kicks: {
                home: event.free_kicks_home || event.free_kicks?.home || 0,
                away: event.free_kicks_away || event.free_kicks?.away || 0
            },
            injuries: {
                home: event.injuries_home || event.injuries?.home || 0,
                away: event.injuries_away || event.injuries?.away || 0
            },
            penalties: {
                home: event.penalties_home || event.penalties?.home || 0,
                away: event.penalties_away || event.penalties?.away || 0
            },
            substitutions: {
                home: event.substitutions_home || event.substitutions?.home || 0,
                away: event.substitutions_away || event.substitutions?.away || 0
            },
            is_live: isLive,
            is_upcoming: isUpcoming,
            event_date: event.event_date || event.date,
            status: status,
            league_id: event.league_id
        };
    });
}

// Update date range label
function updateDateRangeLabel(dateFrom, dateTo) {
    const label = document.getElementById('dateRangeLabel');
    if (!label) return;

    if (!dateFrom && !dateTo) {
        label.textContent = 'All Time';
        return;
    }

    // If it's a single date
    if (dateFrom === dateTo) {
        const date = new Date(dateFrom + 'T00:00:00');
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        if (dateFrom === todayStr) {
            label.textContent = 'Today';
        } else {
            label.textContent = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        }
        return;
    }

    // Date range
    const from = new Date(dateFrom + 'T00:00:00');
    const to = new Date(dateTo + 'T00:00:00');
    const daysDiff = Math.ceil((to - from) / (1000 * 60 * 60 * 24));

    if (daysDiff === 0) {
        label.textContent = from.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    } else if (daysDiff <= 7) {
        label.textContent = `${daysDiff} Days`;
    } else {
        label.textContent = `${from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${to.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
}

// Refresh matches from API - SILENT UPDATE (no flicker)
async function refreshMatches() {
    // Don't show loading indicator to prevent flicker
    try {
        let url = '/api/events?';
        const params = [];

        if (currentDateFrom) {
            params.push(`date_from=${currentDateFrom}`);
        }
        if (currentDateTo) {
            params.push(`date_to=${currentDateTo}`);
        }
        if (currentStatus && currentStatus !== 'all') {
            params.push(`status=${currentStatus}`);
        }

        // If no date set, use today
        if (params.length === 0) {
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            params.push(`date_from=${todayStr}`);
            params.push(`date_to=${todayStr}`);
        }

        url += params.join('&');

        const response = await fetch(url);
        const events = await response.json();

        let eventArray = [];
        if (Array.isArray(events)) {
            eventArray = events;
        } else if (events && typeof events === 'object') {
            if (events.events && Array.isArray(events.events)) {
                eventArray = events.events;
            } else if (events.results && Array.isArray(events.results)) {
                eventArray = events.results;
            } else {
                for (const key in events) {
                    if (Array.isArray(events[key])) {
                        eventArray = events[key];
                        break;
                    }
                }
            }
        }

        if (eventArray.length > 0) {
            const newData = transformApiData(eventArray);
            let hasChanges = false;

            // Update existing matches
            newData.forEach(newMatch => {
                const existingIndex = allMatchData.findIndex(m => m.id === newMatch.id);
                if (existingIndex !== -1) {
                    const oldMatch = allMatchData[existingIndex];
                    if (JSON.stringify(oldMatch) !== JSON.stringify(newMatch)) {
                        const keys = ['score', 'timer', 'momentum', 'xg', 'shots', 'shots_on_target', 'blocked_shots', 'corners', 'free_kicks', 'throw_ins', 'goal_kicks', 'attacks', 'dangerous_attacks', 'possession', 'passes', 'accurate_passes', 'pass_accuracy', 'total_tackles', 'tackles_won', 'interceptions', 'clearances', 'duels', 'aerial_duels', 'gk_saves', 'big_saves', 'goals_prevented', 'fouls', 'yellow_cards', 'red_cards', 'substitutions'];
                        keys.forEach(key => {
                            if (JSON.stringify(oldMatch[key]) !== JSON.stringify(newMatch[key])) {
                                if (key === 'score') newMatch._updated = true;
                                else if (key === 'timer') newMatch._timerUpdated = true;
                                else if (key === 'momentum') newMatch._momentumUpdated = true;
                                else if (key === 'xg') newMatch._xgUpdated = true;
                                else if (key === 'shots') newMatch._shotsUpdated = true;
                                else if (key === 'shots_on_target') newMatch._sotUpdated = true;
                                else if (key === 'blocked_shots') newMatch._blockedShotsUpdated = true;
                                else if (key === 'corners') newMatch._cornersUpdated = true;
                                else if (key === 'free_kicks') newMatch._freeKicksUpdated = true;
                                else if (key === 'throw_ins') newMatch._throwInsUpdated = true;
                                else if (key === 'goal_kicks') newMatch._goalKicksUpdated = true;
                                else if (key === 'attacks') newMatch._attacksUpdated = true;
                                else if (key === 'dangerous_attacks') newMatch._dangerousAttacksUpdated = true;
                                else if (key === 'possession') newMatch._possessionUpdated = true;
                                else if (key === 'passes') newMatch._passesUpdated = true;
                                else if (key === 'accurate_passes') newMatch._accuratePassesUpdated = true;
                                else if (key === 'pass_accuracy') newMatch._passAccuracyUpdated = true;
                                else if (key === 'total_tackles') newMatch._totalTacklesUpdated = true;
                                else if (key === 'tackles_won') newMatch._tacklesWonUpdated = true;
                                else if (key === 'interceptions') newMatch._interceptionsUpdated = true;
                                else if (key === 'clearances') newMatch._clearancesUpdated = true;
                                else if (key === 'duels') newMatch._duelsUpdated = true;
                                else if (key === 'ground_duels') newMatch._groundDuelsUpdated = true;
                                else if (key === 'aerial_duels') newMatch._aerialDuelsUpdated = true;
                                else if (key === 'duels_won') newMatch._duelsWonUpdated = true;
                                else if (key === 'gk_saves') newMatch._gkSavesUpdated = true;
                                else if (key === 'big_saves') newMatch._bigSavesUpdated = true;
                                else if (key === 'goals_prevented') newMatch._goalsPreventedUpdated = true;
                                else if (key === 'fouls') newMatch._foulsUpdated = true;
                                else if (key === 'offsides') newMatch._offsidesUpdated = true;
                                else if (key === 'yellow_cards') newMatch._ycUpdated = true;
                                else if (key === 'red_cards') newMatch._rcUpdated = true;
                                else if (key === 'substitutions') newMatch._subsUpdated = true;
                            }
                        });
                        allMatchData[existingIndex] = newMatch;
                        hasChanges = true;
                    }
                } else {
                    allMatchData.push(newMatch);
                    hasChanges = true;
                }
            });

            // Only update grid if there are changes
            if (hasChanges) {
                // ✅ Silent update - no flicker
                filterMatches(currentFilter);
                console.log('🔄 Data updated silently');
            }
        }
    } catch (error) {
        console.error('Error refreshing matches:', error);
    }
}

// Use mock data when API fails
function useMockData() {
    const mockData = generateMockData();
    allMatchData = mockData;
    rowData = buildGroupedData(mockData);

    const leagues = [...new Set(mockData.map(m => m.league))];
    leagues.forEach(league => {
        expandedGroups[league] = true;
    });

    storePreviousValues(rowData);
    gridApi.setRowData(rowData);
    updateCounts(rowData);

    if (updateInterval) {
        clearInterval(updateInterval);
    }
    updateInterval = setInterval(() => {
        if (gridApi) {
            updateMockData();
        }
    }, 10000);

    console.log(`Using ${mockData.length} mock matches`);
}

// Generate mock data (fallback)
function generateMockData() {
    const leagues = [
        'Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1',
        'UEFA Champions League', 'Europa League', 'MLS'
    ];

    const teams = [
        'Manchester City', 'Manchester United', 'Liverpool', 'Arsenal', 'Chelsea', 'Tottenham',
        'Real Madrid', 'Barcelona', 'Atletico Madrid', 'Sevilla',
        'Bayern Munich', 'Borussia Dortmund', 'RB Leipzig', 'Bayer Leverkusen',
        'PSG', 'Marseille', 'Lyon', 'Monaco',
        'AC Milan', 'Inter Milan', 'Juventus', 'Napoli', 'Roma'
    ];

    const matches = [];

    for (let i = 0; i < 45; i++) {
        const league = leagues[Math.floor(Math.random() * leagues.length)];
        const home = teams[Math.floor(Math.random() * teams.length)];
        let away = teams[Math.floor(Math.random() * teams.length)];
        while (away === home) away = teams[Math.floor(Math.random() * teams.length)];

        const minute = Math.floor(Math.random() * 95);
        const isLive = minute > 0 && minute < 90 && Math.random() > 0.2;
        const isFullTime = minute > 90;

        let timer = '—';
        if (isFullTime) timer = 'FT';
        else if (isLive) timer = `${minute}'`;

        matches.push({
            id: `mock_${i}`,
            league: league,
            home_team: home,
            away_team: away,
            match: `${home} vs ${away}`,
            score: `${Math.floor(Math.random() * 5)}-${Math.floor(Math.random() * 5)}`,
            ht_score: `${Math.floor(Math.random() * 3)}-${Math.floor(Math.random() * 3)}`,
            timer: timer,
            momentum: { home: Math.floor(Math.random() * 100), away: Math.floor(Math.random() * 100) },
            xg: { home: parseFloat((Math.random() * 3.5).toFixed(1)), away: parseFloat((Math.random() * 3.5).toFixed(1)) },
            shots_on_target: { home: Math.floor(Math.random() * 8), away: Math.floor(Math.random() * 8) },
            corners: { home: Math.floor(Math.random() * 10), away: Math.floor(Math.random() * 10) },
            attacks: { home: Math.floor(Math.random() * 100), away: Math.floor(Math.random() * 100) },
            possession: { home: Math.floor(Math.random() * 80) + 10, away: Math.floor(Math.random() * 80) + 10 },
            yellow_cards: { home: Math.floor(Math.random() * 4), away: Math.floor(Math.random() * 4) },
            red_cards: { home: Math.random() > 0.9 ? 1 : 0, away: Math.random() > 0.9 ? 1 : 0 },
            substitutions: { home: Math.floor(Math.random() * 3), away: Math.floor(Math.random() * 3) },
            is_live: isLive
        });
    }
    return matches;
}

// Update mock data (fallback)
function updateMockData() {
    let hasUpdates = false;

    allMatchData.forEach(match => {
        if (!match.is_live) return;

        match._updated = false;
        match._timerUpdated = false;
        match._momentumUpdated = false;
        match._xgUpdated = false;
        match._sotUpdated = false;
        match._cornersUpdated = false;
        match._attacksUpdated = false;
        match._possessionUpdated = false;
        match._ycUpdated = false;
        match._rcUpdated = false;
        match._subsUpdated = false;

        if (Math.random() > 0.7) {
            const parts = match.score.split('-');
            if (Math.random() > 0.5) parts[0] = parseInt(parts[0]) + 1;
            if (Math.random() > 0.5) parts[1] = parseInt(parts[1]) + 1;
            const newScore = `${parts[0]}-${parts[1]}`;
            if (newScore !== match.score) {
                match.score = newScore;
                match._updated = true;
                hasUpdates = true;
            }
        }

        if (Math.random() > 0.6 && match.timer !== 'FT') {
            const currentMin = parseInt(match.timer) || 0;
            if (currentMin < 90) {
                match.timer = `${currentMin + 1}'`;
                match._timerUpdated = true;
                hasUpdates = true;
            } else if (currentMin >= 90) {
                match.timer = 'FT';
                match._timerUpdated = true;
                hasUpdates = true;
            }
        }
    });

    if (hasUpdates) {
        const newRowData = rowData.map(row => {
            if (!row.isGroupHeader) {
                const updatedMatch = allMatchData.find(m => m.id === row.id);
                if (updatedMatch) {
                    return { ...updatedMatch, isGroupHeader: false };
                }
            }
            return row;
        });

        rowData = newRowData;
        gridApi.setRowData(newRowData);
        updateCounts(newRowData);
    }
}

// Build grouped data
function buildGroupedData(matches) {
    const grouped = {};
    matches.forEach(match => {
        if (!grouped[match.league]) {
            grouped[match.league] = [];
        }
        grouped[match.league].push(match);
    });

    const result = [];
    const sortedLeagues = Object.keys(grouped).sort();

    sortedLeagues.forEach(league => {
        result.push({
            id: `header_${league}`,
            league: league,
            match: '',
            score: '',
            ht_score: '',
            timer: '',
            isGroupHeader: true,
            groupCount: grouped[league].length,
            home_team: '',
            away_team: '',
            momentum: null,
            xg: null,
            shots_on_target: null,
            corners: null,
            attacks: null,
            possession: null,
            yellow_cards: null,
            red_cards: null,
            substitutions: null
        });
        result.push(...grouped[league]);
    });

    return result;
}

// Store previous values for highlighting
function storePreviousValues(data) {
    data.forEach(row => {
        if (!row.isGroupHeader) {
            const key = row.id;
            previousValues[key] = {
                score: row.score,
                timer: row.timer,
                momentum_home: row.momentum?.home || 0,
                momentum_away: row.momentum?.away || 0,
                xg_home: row.xg?.home || 0,
                xg_away: row.xg?.away || 0,
                sot_home: row.shots_on_target?.home || 0,
                sot_away: row.shots_on_target?.away || 0,
                corners_home: row.corners?.home || 0,
                corners_away: row.corners?.away || 0,
                attacks_home: row.attacks?.home || 0,
                attacks_away: row.attacks?.away || 0,
                possession_home: row.possession?.home || 0,
                possession_away: row.possession?.away || 0,
                yc_home: row.yellow_cards?.home || 0,
                yc_away: row.yellow_cards?.away || 0,
                rc_home: row.red_cards?.home || 0,
                rc_away: row.red_cards?.away || 0,
                subs_home: row.substitutions?.home || 0,
                subs_away: row.substitutions?.away || 0
            };
        }
    });
}

// Current filter
let currentFilter = 'all';

function filterMatches(filterType) {
    currentFilter = filterType;

    clearNoMatchesMessage();

    // Update active nav state
    document.querySelectorAll('.navbar-nav .nav-item').forEach(item => {
        item.classList.remove('active');
    });

    const navMap = {
        'live': 'nav-inplay',
        'all': 'nav-all',
        'upcoming': 'nav-upcoming',
        'finished': 'nav-finished'
    };

    const activeNav = document.getElementById(navMap[filterType]);
    if (activeNav) {
        activeNav.classList.add('active');
    }

    let filteredData = [];

    if (filterType === 'all') {
        filteredData = allMatchData;
    } else if (filterType === 'live') {
        filteredData = allMatchData.filter(match => match.is_live === true);
    } else if (filterType === 'upcoming') {
        filteredData = allMatchData.filter(match => match.is_upcoming === true);
    } else if (filterType === 'finished') {
        filteredData = allMatchData.filter(match => {
            const status = match.status || '';
            return status === 'finished' || status === 'fulltime' || status === 'FT' ||
                status === 'aet' || status === 'penalties' || status === 'PEN' ||
                match.timer === 'FT' || match.timer === 'AET' || match.timer === 'PEN';
        });
    }

    const groupedData = buildGroupedData(filteredData);
    rowData = groupedData;

    updateCounts(groupedData);

    // ✅ Update grid without flicker
    gridApi.setRowData(groupedData);

    console.log(`🔍 Filter: ${filterType}, showing ${filteredData.length} matches`);
}

// Fetch data from API with date filters
async function fetchMatches(dateFrom, dateTo, status) {
    if (isLoading) return;
    isLoading = true;

    console.log('========================================');
    console.log('📅 FETCH MATCHES CALLED');
    console.log('📅 Date From:', dateFrom);
    console.log('📅 Date To:', dateTo);
    console.log('📅 Status:', status);
    console.log('========================================');

    // ✅ Don't show "..." on the count - prevents flicker
    // const liveCount = document.getElementById('liveCount');
    // if (liveCount) liveCount.textContent = '...';

    clearNoMatchesMessage();

    try {
        let url = '/api/events?';
        const params = [];

        let fromDate = dateFrom;
        let toDate = dateTo;

        if (!fromDate && !toDate) {
            const today = new Date();
            fromDate = today.toISOString().split('T')[0];
            toDate = today.toISOString().split('T')[0];
            console.log('📅 No date provided - using today:', fromDate);
        }

        if (fromDate) {
            params.push(`date_from=${fromDate}`);
            currentDateFrom = fromDate;
        }
        if (toDate) {
            params.push(`date_to=${toDate}`);
            currentDateTo = toDate;
        }
        if (status && status !== 'all') {
            params.push(`status=${status}`);
            currentStatus = status;
        }

        url += params.join('&');

        console.log('🔗 FULL URL:', url);

        const response = await fetch(url);
        const events = await response.json();

        let eventArray = [];
        if (Array.isArray(events)) {
            eventArray = events;
        } else if (events && typeof events === 'object') {
            if (events.events && Array.isArray(events.events)) {
                eventArray = events.events;
            } else if (events.results && Array.isArray(events.results)) {
                eventArray = events.results;
            } else {
                for (const key in events) {
                    if (Array.isArray(events[key])) {
                        eventArray = events[key];
                        break;
                    }
                }
            }
        }

        console.log(`📊 Found ${eventArray.length} events for ${fromDate}`);

        if (eventArray.length === 0) {
            console.warn(`⚠️ No matches found for ${fromDate}`);
            allMatchData = [];
            rowData = [];
            gridApi.setRowData([]);
            updateCounts([]);
            updateDateRangeLabel(fromDate, toDate);
            showNoMatchesMessage(fromDate);
            return;
        }

        const transformedData = transformApiData(eventArray);
        allMatchData = transformedData;

        updateDateRangeLabel(fromDate, toDate);
        filterMatches(currentFilter);

        console.log(`✅ Loaded ${transformedData.length} matches for ${fromDate}`);
        console.log('========================================\n');

    } catch (error) {
        console.error('❌ Error fetching matches:', error);
        showErrorMessage(error.message);
        useMockData();
    } finally {
        isLoading = false;
    }
}

// Show no matches message
function showNoMatchesMessage(date) {
    const gridElement = document.getElementById('inplay-grid');
    if (gridElement) {
        // Create a message overlay
        const existingMessage = document.querySelector('.no-matches-overlay');
        if (existingMessage) existingMessage.remove();

        const overlay = document.createElement('div');
        overlay.className = 'no-matches-overlay';
        overlay.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;color:#5f6368;padding:20px;">
                <i class="fas fa-calendar-day" style="font-size:48px;color:#dadce0;margin-bottom:16px;"></i>
                <h5 style="font-weight:600;margin-bottom:8px;">No matches found</h5>
                <p style="color:#9aa0a6;font-size:14px;">No matches scheduled for ${date}</p>
                <p style="color:#9aa0a6;font-size:12px;margin-top:4px;">Try selecting a different date</p>
            </div>
        `;
        gridElement.style.position = 'relative';
        gridElement.appendChild(overlay);
    }
}

// Show error message
function showErrorMessage(message) {
    const gridElement = document.getElementById('inplay-grid');
    if (gridElement) {
        const existingMessage = document.querySelector('.no-matches-overlay');
        if (existingMessage) existingMessage.remove();

        const overlay = document.createElement('div');
        overlay.className = 'no-matches-overlay';
        overlay.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;color:#5f6368;padding:20px;">
                <i class="fas fa-exclamation-triangle" style="font-size:48px;color:#ea4335;margin-bottom:16px;"></i>
                <h5 style="font-weight:600;margin-bottom:8px;">Error loading matches</h5>
                <p style="color:#9aa0a6;font-size:14px;">${message || 'Please try again later'}</p>
            </div>
        `;
        gridElement.style.position = 'relative';
        gridElement.appendChild(overlay);
    }
}

// Clear no matches message
function clearNoMatchesMessage() {
    const existingMessage = document.querySelector('.no-matches-overlay');
    if (existingMessage) existingMessage.remove();
}

// Update counts
function updateCounts(data) {
    const liveMatches = data.filter(m => m.is_live !== false && !m.isGroupHeader);
    const liveCount = document.getElementById('liveCount');
    if (liveCount) liveCount.textContent = liveMatches.length;

    const matches = data.filter(m => !m.isGroupHeader);
    const filterCount = document.getElementById('filterCount');
    const totalCount = document.getElementById('totalCount');
    if (filterCount) filterCount.textContent = matches.length;
    if (totalCount) totalCount.textContent = matches.length;
}

// Expand/Collapse all
function expandAll() {
    const leagues = [...new Set(allMatchData.map(m => m.league))];
    leagues.forEach(league => {
        expandedGroups[league] = true;
    });

    const data = buildGroupedData(allMatchData);
    rowData = data;
    gridApi.setRowData(data);
    updateCounts(data);
}

function collapseAll() {
    const leagues = [...new Set(allMatchData.map(m => m.league))];
    leagues.forEach(league => {
        expandedGroups[league] = false;
    });

    const data = buildGroupedData(allMatchData);
    rowData = data;
    gridApi.setRowData(data);
    updateCounts(data);
}

// Initialize
document.addEventListener('DOMContentLoaded', function () {
    const gridDiv = document.getElementById('inplay-grid');
    if (gridDiv) {
        new agGrid.Grid(gridDiv, gridOptions);
    }

    document.querySelector('.tg-channel-bar__close')?.addEventListener('click', function () {
        this.closest('.tg-channel-bar').style.display = 'none';
    });

    // Navigation filter buttons
    document.querySelectorAll('.navbar-nav .nav-item a[data-filter]').forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const filter = this.dataset.filter;
            filterMatches(filter);
        });
    });

    // Expand/Collapse buttons
    const expandBtn = document.getElementById('expandAll');
    if (expandBtn) {
        expandBtn.addEventListener('click', expandAll);
    }

    const collapseBtn = document.getElementById('collapseAll');
    if (collapseBtn) {
        collapseBtn.addEventListener('click', collapseAll);
    }

    // ============================================
    // DATE PICKER - Load data ONCE on page load
    // ============================================
    const datePicker = document.getElementById('datePicker');
    const fetchBtn = document.getElementById('fetchDateBtn');

    if (datePicker) {
        // Set default to today
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        datePicker.value = todayStr;
        console.log('📅 Date picker initialized to:', todayStr);

        // ✅ ONLY LOAD ONCE - No repeated loading
        // Use a flag to prevent multiple loads
        if (!window._dataLoaded) {
            window._dataLoaded = true;
            fetchMatches(todayStr, todayStr, 'all');
            updateDateRangeLabel(todayStr, todayStr);
        }
    }

    // Fetch button click
    if (fetchBtn && datePicker) {
        fetchBtn.addEventListener('click', function (e) {
            e.preventDefault();
            const selectedDate = datePicker.value;
            console.log('🔍 Fetch button clicked! Selected date:', selectedDate);

            if (selectedDate) {
                clearNoMatchesMessage();
                fetchMatches(selectedDate, selectedDate, 'all');
                updateDateRangeLabel(selectedDate, selectedDate);
            } else {
                alert('Please select a date');
            }
        });
    }

    // Enter key on date picker
    if (datePicker) {
        datePicker.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const selectedDate = datePicker.value;
                console.log('🔍 Enter key pressed! Selected date:', selectedDate);

                if (selectedDate) {
                    clearNoMatchesMessage();
                    fetchMatches(selectedDate, selectedDate, 'all');
                    updateDateRangeLabel(selectedDate, selectedDate);
                }
            }
        });
    }

    // ✅ AUTO-FETCH ON DATE CHANGE (but only when user selects, not on init)
    if (datePicker) {
        datePicker.addEventListener('change', function () {
            const selectedDate = this.value;
            console.log('📅 Date changed to:', selectedDate);

            if (selectedDate) {
                clearNoMatchesMessage();
                fetchMatches(selectedDate, selectedDate, 'all');
                updateDateRangeLabel(selectedDate, selectedDate);
            }
        });
    }

    // ✅ AUTO-REFRESH - Only update data, no page refresh
    // Use a longer interval and only refresh if data exists
    setInterval(() => {
        if (gridApi && !isLoading && allMatchData.length > 0) {
            console.log('🔄 Auto-refreshing data...');
            refreshMatches();
        }
    }, 10000); // 10 seconds - less frequent
});

// Also update filterMatches to clear the no matches message
function filterMatches(filterType) {
    currentFilter = filterType;

    // Clear any "no matches" message
    clearNoMatchesMessage();

    // Update active nav state
    document.querySelectorAll('.navbar-nav .nav-item').forEach(item => {
        item.classList.remove('active');
    });

    const navMap = {
        'live': 'nav-inplay',
        'all': 'nav-all',
        'upcoming': 'nav-upcoming',
        'finished': 'nav-finished'
    };

    const activeNav = document.getElementById(navMap[filterType]);
    if (activeNav) {
        activeNav.classList.add('active');
    }

    // Filter the data
    let filteredData = [];

    if (filterType === 'all') {
        filteredData = allMatchData;
    } else if (filterType === 'live') {
        filteredData = allMatchData.filter(match => match.is_live === true);
    } else if (filterType === 'upcoming') {
        filteredData = allMatchData.filter(match => match.is_upcoming === true);
    } else if (filterType === 'finished') {
        filteredData = allMatchData.filter(match => {
            const status = match.status || '';
            return status === 'finished' || status === 'fulltime' || status === 'FT' ||
                status === 'aet' || status === 'penalties' || status === 'PEN' ||
                match.timer === 'FT' || match.timer === 'AET' || match.timer === 'PEN';
        });
    }

    // Rebuild grouped data with filtered matches
    const groupedData = buildGroupedData(filteredData);
    rowData = groupedData;

    // Update counts
    updateCounts(groupedData);

    // Update grid
    gridApi.setRowData(groupedData);

    console.log(`🔍 Filter: ${filterType}, showing ${filteredData.length} matches`);
}