import Excel from 'exceljs';
import path from 'path';
import fs from 'fs';
import logger from '../../utils/logger';

export interface AgentSummaryData {
  agentName: string;
  agentId: string;
  totalHandleCalls: number;
  averageHandleTime: string; // HH:MM format
  refusedCalls: number;
  loginTime: string; // HH:MM:SS format
  workingRate: number; // percentage
  occupancy: number; // percentage
}

export interface AgentUnavailableData {
  agentName: string;
  agentId: string;
  code: string;
  durationInSeconds: number;
}

export interface CSVMapping {
  [criteria: string]: {
    file: string;
    location: string;
    unit: string;
    expected: string;
  };
}

export interface ConsolidatedReport {
  month: number;
  year: number;
  agentId: string;
  agentName: string;
  totalHandleCalls: number;
  averageHandleTime: string;
  agentUnavailableTimeHours: number;
  refusedCalls: number;
  // AUT breakdown
  arfSeconds: number;
  correctingRepostSeconds: number;
  editTransferSeconds: number;
  emailsSeconds: number;
  faxesSeconds: number;
  meetingSeconds: number;
  miscSeconds: number;
  paymentPlanSeconds: number;
  personalSeconds: number;
  printingLogSeconds: number;
  statementsSeconds: number;
  taskSeconds: number;
  technicalIssueSeconds: number;
  trainingSeconds: number;
  vmsSeconds: number;
  wrapUpSeconds: number;
  breakSeconds: number;
  lunchSeconds: number;
  totalSeconds: number;
}

export class ExcelParserService {
  private csvMapping: CSVMapping = {};
  private mappingFilePath: string;

  constructor(mappingFilePath?: string) {
    this.mappingFilePath = mappingFilePath || path.join(__dirname, '../../../../report details.csv');
    this.loadCSVMapping();
  }

  private loadCSVMapping(): void {
    try {
      if (!fs.existsSync(this.mappingFilePath)) {
        logger.warn(`CSV mapping file not found at: ${this.mappingFilePath}`);
        return;
      }

      const csvContent = fs.readFileSync(this.mappingFilePath, 'utf8');
      const lines = csvContent.split('\n').slice(2); // Skip first 2 rows as per analysis

      lines.forEach(line => {
        const parts = line.split(',');
        if (parts.length >= 7) {
          const criteria = parts[1]?.trim();
          if (criteria && criteria !== 'Criteria' && criteria !== '') {
            this.csvMapping[criteria] = {
              file: parts[5]?.trim(),
              location: parts[4]?.trim(),
              unit: parts[2]?.trim(),
              expected: parts[3]?.trim()
            };
          }
        }
      });

      logger.info(`Loaded ${Object.keys(this.csvMapping).length} CSV mapping entries`);
    } catch (error) {
      logger.error('Failed to load CSV mapping:', error);
      throw error;
    }
  }

  public async parseAgentSummary(filePath: string): Promise<AgentSummaryData[]> {
    try {
      const workbook = new Excel.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.getWorksheet(1);

      if (!worksheet) {
        throw new Error('Agent Summary worksheet not found');
      }
      
      const agents: AgentSummaryData[] = [];
      
      // Skip header row (row 1)
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header
        
        const agentCell = row.getCell(1).value;
        if (!agentCell || typeof agentCell !== 'string') return;
        
        // Extract agent ID from "Last, First (ID)" pattern
        const agentMatch = agentCell.match(/(.+)\s+\((\d+)\)$/);
        if (!agentMatch) return;
        
        const agentName = agentMatch[1].trim();
        const agentId = agentMatch[2];
        
        const totalHandleCalls = this.parseNumber(row.getCell(2).value);
        const averageHandleTime = this.formatTime(row.getCell(3).value);
        const refusedCalls = this.parseNumber(row.getCell(8).value);
        const loginTime = this.formatTime(row.getCell(9).value, true);
        const workingRate = this.parsePercentage(row.getCell(10).value);
        const occupancy = this.parsePercentage(row.getCell(11).value);
        
        agents.push({
          agentName,
          agentId,
          totalHandleCalls: totalHandleCalls || 0,
          averageHandleTime: averageHandleTime || '00:00',
          refusedCalls: refusedCalls || 0,
          loginTime: loginTime || '00:00:00',
          workingRate: workingRate || 0,
          occupancy: occupancy || 0
        });
      });
      
      logger.info(`Parsed ${agents.length} agents from Agent Summary file`);
      return agents;
    } catch (error) {
      logger.error('Failed to parse Agent Summary file:', error);
      throw error;
    }
  }

  public async parseAgentUnavailableTime(filePath: string): Promise<AgentUnavailableData[]> {
    try {
      const workbook = new Excel.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.getWorksheet(1);

      if (!worksheet) {
        throw new Error('Agent Unavailable Time worksheet not found');
      }
      
      const data: AgentUnavailableData[] = [];
      let currentAgent = '';
      let currentAgentId = '';
      
      worksheet.eachRow({ includeEmpty: false }, row => {
        const agentCell = row.getCell(1).value;
        const codeCell = row.getCell(2).value;
        const secondsCell = row.getCell(3).value;
        
        // Update current agent if we found a new agent name
        if (agentCell && typeof agentCell === 'string' && agentCell.trim() !== '') {
          const agentMatch = agentCell.match(/(.+)\s+\((\d+)\)$/);
          if (agentMatch) {
            currentAgent = agentMatch[1].trim();
            currentAgentId = agentMatch[2];
          } else {
            currentAgent = agentCell.trim();
            currentAgentId = '';
          }
        }
        
        // Process code and duration if we have both
        if (codeCell && typeof codeCell === 'string' && secondsCell) {
          const code = codeCell.trim();
          const seconds = this.parseNumber(secondsCell);
          
          if (currentAgent && code && seconds !== null) {
            data.push({
              agentName: currentAgent,
              agentId: currentAgentId,
              code,
              durationInSeconds: seconds
            });
          }
        }
      });
      
      logger.info(`Parsed ${data.length} entries from Agent Unavailable Time file`);
      return data;
    } catch (error) {
      logger.error('Failed to parse Agent Unavailable Time file:', error);
      throw error;
    }
  }

  public consolidateData(
    summaryData: AgentSummaryData[],
    unavailableData: AgentUnavailableData[],
    month: number,
    year: number
  ): ConsolidatedReport[] {
    const consolidated: ConsolidatedReport[] = [];
    
    // Group unavailable data by agent
    const unavailableByAgent: { [agentId: string]: AgentUnavailableData[] } = {};
    unavailableData.forEach(item => {
      const agentId = item.agentId || this.extractIdFromName(item.agentName);
      if (!unavailableByAgent[agentId]) {
        unavailableByAgent[agentId] = [];
      }
      unavailableByAgent[agentId].push(item);
    });
    
    // Consolidate each agent
    summaryData.forEach(summary => {
      const agentId = summary.agentId;
      const agentUnavailable = unavailableByAgent[agentId] || [];
      
      // Calculate AUT totals from CSV mapping
      const autBreakdown = this.calculateAUTBreakdown(agentUnavailable);
      const totalSeconds = this.calculateTotalAUT(autBreakdown);
      
      const report: ConsolidatedReport = {
        month,
        year,
        agentId,
        agentName: summary.agentName,
        totalHandleCalls: summary.totalHandleCalls,
        averageHandleTime: summary.averageHandleTime,
        agentUnavailableTimeHours: totalSeconds / 3600, // Convert to hours
        refusedCalls: summary.refusedCalls,
        // Map AUT breakdown
        arfSeconds: autBreakdown['ARF'] || 0,
        correctingRepostSeconds: autBreakdown['Correcting & Repost'] || 0,
        editTransferSeconds: autBreakdown['Edit & Transfer'] || 0,
        emailsSeconds: autBreakdown['Emails'] || 0,
        faxesSeconds: autBreakdown['Faxes'] || 0,
        meetingSeconds: autBreakdown['Meeting'] || 0,
        miscSeconds: autBreakdown['Misc'] || 0,
        paymentPlanSeconds: autBreakdown['Payment Plan'] || 0,
        personalSeconds: autBreakdown['Personal'] || 0,
        printingLogSeconds: autBreakdown['Printing/Adding to log'] || 0,
        statementsSeconds: autBreakdown['Statements'] || 0,
        taskSeconds: autBreakdown['Task'] || 0,
        technicalIssueSeconds: autBreakdown['Technical Issue'] || 0,
        trainingSeconds: autBreakdown['Training'] || 0,
        vmsSeconds: autBreakdown['Vms'] || 0,
        wrapUpSeconds: autBreakdown['Wrap Up(above the alloted 30s pe call)'] || 0,
        breakSeconds: autBreakdown['Break (above the alloted time)'] || 0,
        lunchSeconds: autBreakdown['Lunch (above the alloted time)'] || 0,
        totalSeconds
      };
      
      consolidated.push(report);
    });
    
    logger.info(`Consolidated data for ${consolidated.length} agents`);
    return consolidated;
  }

  private calculateAUTBreakdown(unavailableData: AgentUnavailableData[]): { [code: string]: number } {
    const breakdown: { [code: string]: number } = {};
    
    unavailableData.forEach(item => {
      const code = item.code;
      if (!breakdown[code]) {
        breakdown[code] = 0;
      }
      breakdown[code] += item.durationInSeconds;
    });
    
    return breakdown;
  }

  private calculateTotalAUT(breakdown: { [code: string]: number }): number {
    // Use formula from CSV: D13+D15+D14+D16+D19+D20+D21+D23+D28+D29+D30
    // Map to our codes based on analysis
    const total = 
      (breakdown['ARF'] || 0) +
      (breakdown['Edit & Transfer'] || 0) +
      (breakdown['Correcting & Repost'] || 0) +
      (breakdown['Emails'] || 0) +
      (breakdown['Misc'] || 0) +
      (breakdown['Payment Plan'] || 0) +
      (breakdown['Personal'] || 0) +
      (breakdown['Statements'] || 0) +
      (breakdown['Wrap Up(above the alloted 30s pe call)'] || 0) +
      (breakdown['Break (above the alloted time)'] || 0) +
      (breakdown['Lunch (above the alloted time)'] || 0);
    
    return total;
  }

  private extractIdFromName(agentName: string): string {
    const match = agentName.match(/\((\d+)\)$/);
    return match ? match[1] : agentName.replace(/\s+/g, '-');
  }

  private parseNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value.replace(/[^\d.-]/g, ''));
      return isNaN(parsed) ? null : parsed;
    }
    
    return null;
  }

  private parsePercentage(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value.replace('%', ''));
      return isNaN(parsed) ? null : parsed / 100;
    }
    
    return null;
  }

  private formatTime(value: any, includeSeconds: boolean = false): string | null {
    if (value === null || value === undefined || value === '') return null;
    
    if (typeof value === 'string') {
      // Already in time format
      if (value.includes(':')) return value;
    }
    
    if (typeof value === 'number') {
      // Excel time is fraction of a day
      const totalSeconds = Math.round(value * 86400);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      
      if (includeSeconds) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      } else {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      }
    }
    
    return null;
  }

  public getCSVMapping(): CSVMapping {
    return this.csvMapping;
  }
}
