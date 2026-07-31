using System;
using System.IO;

public class Program {
    public static void Main() {
        string txt = File.ReadAllText(@"C:\Users\javie\.gemini\antigravity\scratch\lozanor-app\index.html");
        int idx = txt.IndexOf("yyyy}-${pad2");
        if(idx == -1) { Console.WriteLine("Not found"); return; }
        char c = txt[idx - 3];
        Console.WriteLine("Char code is: " + (int)c);
        Console.WriteLine("Char is: " + c);
    }
}
