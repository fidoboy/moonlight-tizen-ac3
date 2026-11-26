namespace Apps2Samsung.Models
{
    public class SamsungAuth
    {
        public string access_token { get; set; } = null!;
        public string token_type { get; set; } = null!;
        public string access_token_expires_in { get; set; } = null!;
        public string refresh_token { get; set; } = null!;
        public string refresh_token_expires_in { get; set; } = null!;
        public string userId { get; set; } = null!;
        public string client_id { get; set; } = null!;
        public string inputEmailID { get; set; } = null!;
        public string api_server_url { get; set; }
        public string auth_server_url { get; set; }
        public bool close { get; set; }
        public string closedAction { get; set; }
        public string state { get; set; }
    }
}
