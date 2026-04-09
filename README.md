# Osiris Reporting Application

A comprehensive reporting consolidation application for processing Excel reports, generating email summaries, and managing agent performance data.

## Features

- **Excel File Processing**: Parse Agent Summary and Agent Unavailable Time Excel reports
- **Data Consolidation**: Combine multiple reports into a unified database format
- **Email Generation**: Send personalized performance reports via Microsoft Graph API
- **Dashboard**: Visualize agent performance with time series charts
- **Agent Management**: Edit agent contact information and add comments
- **Data Backup**: Automated SQLite database backups with 30-day retention
- **Duplicate Detection**: Prevent duplicate data uploads by month/year
- **Export Functionality**: Download reports as CSV or view as PDF
- **Authentication**: Simple username/password login (user: Osiris, password: Osiris)

## Tech Stack

### Backend
- **Node.js** + **Express** with TypeScript
- **SQLite** database with automatic backups
- **ExcelJS** for Excel file parsing
- **Microsoft Graph API** for email sending
- **Azure AD** for authentication
- **Multer** for file uploads
- **Winston** for logging

### Frontend
- **React** with TypeScript
- **Vite** for build tooling
- **Chart.js** for data visualization
- **React Table** for data tables
- **React Router** for navigation
- **React Query** for data fetching

### Deployment
- **Docker** with multi-stage builds
- **Docker Compose** for orchestration
- **PM2** for process management

## Project Structure

```
osiris-reporting/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API services
│   │   └── contexts/      # React contexts
│   └── package.json
├── server/                 # Express backend
│   ├── src/
│   │   ├── controllers/   # Route controllers
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic
│   │   └── database/      # Database setup
│   └── package.json
├── data/                   # SQLite database (generated)
├── backups/               # Automated backups (generated)
├── uploads/               # Temporary file uploads (generated)
├── docker/                # Docker configuration
├── Dockerfile             # Production Dockerfile
├── Dockerfile.dev         # Development Dockerfile
├── docker-compose.yml     # Production compose file
├── docker-compose.dev.yml # Development compose file
└── README.md
```

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Docker and Docker Compose (optional)
- Azure AD credentials for email sending

### Quick Start with Docker (Recommended)

1. Clone the repository:
```bash
git clone <repository-url>
cd osiris-reporting
```

2. Create `.env` file with Azure AD credentials:
```bash
cp server/.env.example server/.env
# Edit server/.env with your Azure AD credentials
```

3. Start the application:
```bash
docker-compose up -d
```

4. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001
   - Login: Username: `Osiris`, Password: `Osiris`

### Development Setup

1. Install dependencies:
```bash
cd server && npm install
cd ../client && npm install
```

2. Start development servers:
```bash
# Terminal 1: Backend
cd server && npm run dev

# Terminal 2: Frontend  
cd client && npm run dev
```

3. Or use Docker for development:
```bash
docker-compose -f docker-compose.dev.yml up
```

## Configuration

### Environment Variables

See `server/.env.example` for all available options. Key variables:

```env
# Authentication
JWT_SECRET=your-secret-key
LOGIN_USERNAME=Osiris
LOGIN_PASSWORD=Osiris

# Azure AD / Microsoft Graph API
AZURE_CLIENT_ID=your-client-id
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_SECRET=your-client-secret
MAIL_TARGET_ADDRESS=gemini@tnoutsourcing.com

# File Upload
MAX_FILE_SIZE=10485760  # 10MB
EMAIL_RATE_LIMIT=20     # emails per minute
```

### Database Schema

The application uses SQLite with the following tables:
- `monthly_reports`: Consolidated report data
- `agents`: Agent contact information
- `agent_comments`: Per-agent monthly comments
- `email_history`: Email sending logs
- `email_delivery_reports`: Detailed email tracking
- `backup_logs`: Backup history
- `audit_logs`: User action tracking
- `file_uploads`: File processing history

## Usage Guide

### 1. File Upload
1. Navigate to Upload page
2. Select month and year
3. Upload both Excel files:
   - Agent Summary report (IC_Reports_AgentSummary*.xlsx)
   - Agent Unavailable Time report (IC_Reports_AgentUnavailableTime*.xlsx)
4. Click "Process Files"

### 2. View Reports
1. Navigate to Reports page
2. Filter by month/year and agent
3. View consolidated data
4. Add agent comments as needed

### 3. Send Emails
1. Navigate to Email page
2. Select agents and month/year
3. Preview email content
4. Click "Send" to deliver via Microsoft Graph API

### 4. Manage Agents
1. Navigate to Agents page
2. Add/edit agent email addresses
3. Update agent information

### 5. Backup Management
1. Navigate to Backup page
2. View backup statistics
3. Create manual backups
4. Restore from previous backups

## File Formats

### Required Excel Files
1. **Agent Summary Report**: Structured database format with columns:
   - Agent Name (ID) - "Last, First (ID)" format
   - Handled (Inbound)
   - Avg Talk Time (Inbound)
   - Refused
   - etc.

2. **Agent Unavailable Time Report**: Summarized format with merged cells:
   - Agent Name (ID) - Only appears once per agent group
   - Code - Unavailable time categories (ARF, Edit & Transfer, etc.)
   - DurationInSeconds - Time in seconds

3. **Report Details CSV**: Maps Excel data to consolidated format:
   - Columns B,C,D = Criteria, unit, value
   - "location within file" column tells where to find data

## API Documentation

The backend provides RESTful API endpoints:

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### File Upload
- `POST /api/upload` - Upload and process Excel files
- `GET /api/upload/check-duplicate` - Check for existing data

### Reports
- `GET /api/reports` - Get reports with filtering
- `GET /api/reports/time-series` - Get agent time series data
- `POST /api/reports/comments` - Update agent comments

### Agents
- `GET /api/agents` - List agents
- `POST /api/agents` - Create agent
- `PUT /api/agents/:id` - Update agent
- `DELETE /api/agents/:id` - Delete agent

### Email
- `POST /api/email/send` - Send email to agent
- `POST /api/email/send-bulk` - Send bulk emails
- `GET /api/email/history` - View email history

### Backup
- `POST /api/backup/create` - Create backup
- `GET /api/backup/list` - List backups
- `POST /api/backup/restore/:file` - Restore from backup

## Backup Strategy

- **Automated Backups**: Daily at 2:00 AM
- **Retention**: 30 days
- **Storage**: `/app/backups` directory
- **File Naming**: `osiris_backup_YYYY-MM-DDTHH-MM-SS.db`
- **Manual Backups**: Available via web interface

## Troubleshooting

### Common Issues

1. **Excel Parsing Errors**
   - Ensure files follow the exact naming convention
   - Check file formats match the sample files
   - Verify CSV mapping file is present

2. **Email Sending Failures**
   - Verify Azure AD credentials are correct
   - Check network connectivity to Microsoft Graph API
   - Ensure `MAIL_TARGET_ADDRESS` is valid

3. **Database Issues**
   - Check disk space for database and backups
   - Verify file permissions on `/app/data`
   - Use backup restore if database is corrupted

4. **Authentication Problems**
   - Default credentials: Username: `Osiris`, Password: `Osiris`
   - Check JWT_SECRET environment variable
   - Clear browser cache if token issues

### Logs
- Application logs: `/app/logs/combined.log`
- Error logs: `/app/logs/error.log`
- Access logs: Console output in development

## Security Considerations

- **Authentication**: Simple username/password (change in production)
- **File Upload**: Validate file types and sizes
- **Database**: SQLite with file permissions
- **Email**: Azure AD authentication required
- **Network**: Internal use only, no internet exposure needed

## Development

### Adding New Features
1. Create backend controller/service
2. Add API routes
3. Create frontend components
4. Update TypeScript types
5. Test with sample files

### Testing
```bash
# Backend tests
cd server && npm test

# Frontend tests  
cd client && npm test
```

### Building for Production
```bash
# Build everything
docker-compose build

# Or build separately
cd server && npm run build
cd ../client && npm run build
```

## License

Internal Use Only

## Support

For issues and feature requests:
1. Check the troubleshooting guide
2. Review application logs
3. Contact system administrator

---

**Note**: This application is designed for internal use and should not be exposed to the internet without proper security measures.