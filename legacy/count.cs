using System;
using System.IO;
using System.Linq;

public class Prog {
    public static void Main() {
        string txt = File.ReadAllText(@"C:\Users\javie\.gemini\antigravity\scratch\lozanor-app\index.html");
        int count = txt.Count(c => c == '`');
        Console.WriteLine("Total backticks in file: " + count);
        
        int idx = txt.IndexOf("yyyy}-${pad2");
        if (idx != -1) {
            string before = txt.Substring(0, idx);
            int beforeCount = before.Count(c => c == '`');
            Console.WriteLine("Backticks before error line: " + beforeCount);
            
            // Print the last 5 backticks locations before error
            int current = -1;
            for(int i=0; i<5; i++) {
                current = before.LastIndexOf('`', current == -1 ? before.Length - 1 : current - 1);
                if (current != -1) {
                    Console.WriteLine("Backtick at: " + current + "\nContext: " + before.Substring(Math.Max(0, current - 20), Math.Min(40, before.Length - Math.Max(0, current - 20))));
                }
            }
        }
    }
}
