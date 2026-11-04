import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

/** A local stream fixture, not Minecraft; writes only under the isolated E2E root. */
public class GrimoGameOutput {
    public static void main(String[] args) throws Exception {
        if (!"1".equals(System.getenv("XMCL_E2E"))) throw new IllegalStateException("E2E profile required");
        Path root = Path.of(System.getenv("XMCL_E2E_GAME_DATA")).toRealPath();
        Path instance = Path.of("").toRealPath();
        if (!instance.startsWith(root) || instance.equals(root)) throw new IllegalStateException("Isolated instance required");
        System.out.write("start\n".getBytes(StandardCharsets.UTF_8));
        System.out.flush();
        for (byte value : "café 漢字 😀\n".getBytes(StandardCharsets.UTF_8)) {
            System.out.write(value & 255);
            System.out.flush();
            Thread.sleep(2);
        }
        System.err.write("error caf".getBytes(StandardCharsets.US_ASCII));
        System.err.write(0xe9);
        System.err.flush();
        Thread.sleep(2);
        System.err.write('\n');
        System.err.flush();
        Path crash = instance.resolve("crash-reports/grimo-output-café-😀.txt");
        Files.createDirectories(crash.getParent());
        Files.writeString(crash, "fixture crash café 😀\n", StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
        System.out.write(("---- Minecraft Crash Report ----\nCrash report saved to: #@!@# " + crash + "\n").getBytes(StandardCharsets.UTF_8));
        System.out.flush();
        System.exit(1);
    }
}
