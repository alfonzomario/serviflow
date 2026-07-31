using System;
using System.IO;
using System.Text.RegularExpressions;

public class Prog {
    public static void Main() {
        string txt = File.ReadAllText(@"C:\Users\javie\.gemini\antigravity\scratch\lozanor-app\index.html");
        
        // This is a naive regex for simple template literals like `${var}` or `${var1}-${var2}`
        // For a more robust approach, we can manually replace the ones causing issues, or write a C# parser.
        // Let's just output all template literals first to see how complex they are.
        
        var matches = Regex.Matches(txt, @"`([^`]+)`");
        foreach(Match m in matches) {
            Console.WriteLine("Found: " + m.Value);
        }
    }
}
