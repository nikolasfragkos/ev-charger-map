## API Documentation

Η τεκμηρίωση του API ακολουθεί το πρότυπο **OpenAPI 3.0** (Swagger).

### Αρχείο Specification
- [openapi.yaml](./openapi.yaml) - Πλήρες OpenAPI 3.0 specification

### Προβολή Documentation

Μπορείτε να δείτε το API documentation με τους παρακάτω τρόπους:

1. **Swagger Editor Online**: Επισκεφθείτε το [editor.swagger.io](https://editor.swagger.io/) και κάντε import το αρχείο `openapi.yaml`

2. **VS Code Extension**: Χρησιμοποιήστε το extension "OpenAPI (Swagger) Editor" για preview

### API Endpoints Summary

| Category | Base Path | Description |
|----------|-----------|-------------|
| Authentication | `/api/v1/auth` | Εγγραφή και σύνδεση χρηστών |
| Profile | `/api/v1/me` | Διαχείριση προφίλ χρήστη |
| Chargers | `/api/v1/chargers` | Πληροφορίες φορτιστών |
| Points | `/api/v1/points` | Σημεία φόρτισης (εναλλακτικό API) |
| Reservations | `/api/v1/reserve` | Κρατήσεις φορτιστών |
| Sessions | `/api/v1/sessions`, `/api/v1/newsession` | Συνεδρίες φόρτισης |
| Cars | `/api/v1/cars` | Κατάλογος αυτοκινήτων |
| Car Ownership | `/api/v1/car-ownership` | Διαχείριση ιδιοκτησίας αυτοκινήτων |
| Payments | `/api/v1/payments` | Πληρωμές μέσω Stripe |
| Admin | `/api/v1/admin` | Λειτουργίες διαχείρισης |

### Authentication

Η πλειοψηφία των endpoints απαιτεί αυθεντικοποίηση μέσω JWT token:

1. Κάντε signin στο `/api/v1/auth/signin` για να λάβετε token
2. Συμπεριλάβετε το token στο header: `Authorization: Bearer <token>`
