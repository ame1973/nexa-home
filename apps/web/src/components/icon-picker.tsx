import { useId, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/app/preferences";
import {
  api,
  ApiError,
  queryClient,
  type ServiceInput,
} from "@/lib/api/client";
import { Icon, iconNames } from "@/lib/icons";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogTrigger } from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Badge } from "./ui/badge";
import {
  ConfirmDialog,
  ErrorState,
  Field,
  ModalContent,
  Pending,
} from "./common";
import { ServiceIcon } from "./service-tile";

type Choice = Pick<ServiceInput, "iconKind" | "iconValue" | "iconAssetId">;
export function IconPicker({
  value,
  onChange,
}: {
  value: Choice & { color: string };
  onChange(value: Choice): void;
}) {
  const { t } = useI18n();
  const libraryHeading = useId();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("lucide");
  const [search, setSearch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<unknown>();
  const [browse, setBrowse] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const library = useQuery({
    queryKey: ["admin", "icons"],
    queryFn: api.icons,
    enabled: open && browse && tab !== "lucide",
  });
  const upload = useMutation({
    mutationFn: api.upload,
    onSuccess(asset, uploaded) {
      onChange({
        iconKind: tab === "favicon" ? "favicon" : "asset",
        iconValue: Array.from(uploaded.name).slice(0, 120).join(""),
        iconAssetId: asset.id,
      });
      setFile(null);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["admin", "icons"] });
      toast.success(t("iconUploaded"));
    },
  });
  const matches = iconNames.filter((name) =>
    name.includes(search.trim().toLowerCase()),
  );
  const pick = (choice: Choice) => {
    onChange(choice);
    setOpen(false);
  };
  const uploaded = (
    <div className="form-stack">
      <p className="field-hint">
        {tab === "favicon" ? t("faviconHint") : t("uploadHint")}
      </p>
      <Field name="iconFile" label={t("iconFile")} hint={t("uploadHint")}>
        <Input
          type="file"
          accept="image/png,image/webp,image/svg+xml,.svg"
          disabled={upload.isPending}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setFileError(undefined);
            upload.reset();
          }}
        />
      </Field>
      {(fileError !== undefined || upload.isError) && (
        <ErrorState
          error={fileError ?? upload.error}
          message={file && file.size > 1048576 ? t("iconTooLarge") : undefined}
        />
      )}
      <Button
        type="button"
        disabled={!file || upload.isPending}
        onClick={() => {
          if (!file) return;
          if (file.size > 1048576) {
            setFileError(new ApiError(413, "LIMIT_EXCEEDED"));
            return;
          }
          upload.mutate(file);
        }}
      >
        {upload.isPending ? t("uploading") : t("upload")}
      </Button>
      <div className="border-t pt-4">
        <h3 id={libraryHeading} tabIndex={-1} className="mb-3 font-medium">
          {t("savedIcons")}
        </h3>
        {!browse ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setBrowse(true)}
          >
            {t("loadIcons")}
          </Button>
        ) : library.isPending ? (
          <Pending />
        ) : library.isError ? (
          <ErrorState
            error={library.error}
            retry={() => {
              void library.refetch();
            }}
          />
        ) : library.data?.length === 0 ? (
          <p className="muted">{t("iconLibraryEmpty")}</p>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {library.data?.map((asset) => (
              <div key={asset.id} className="icon-library-row">
                <Button
                  type="button"
                  variant="ghost"
                  className="min-w-0 justify-start"
                  disabled={upload.isPending}
                  onClick={() =>
                    pick({
                      iconKind: tab === "favicon" ? "favicon" : "asset",
                      iconValue: asset.mimeType,
                      iconAssetId: asset.id,
                    })
                  }
                  aria-label={t("selectIcon", { name: asset.id })}
                >
                  <img
                    src={asset.url}
                    alt=""
                    className="size-8 object-contain"
                  />
                  <span className="truncate text-xs">
                    {asset.id.slice(0, 8)}
                  </span>
                </Button>
                <div className="flex items-center gap-2">
                  {asset.inUse && (
                    <Badge variant="secondary">{t("iconInUse")}</Badge>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={asset.inUse || upload.isPending}
                    aria-label={`${t("delete")}: ${asset.id}`}
                    onClick={() => setDeleting(asset.id)}
                  >
                    <Trash2 size={17} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!upload.isPending) setOpen(next);
        }}
      >
        <div className="flex items-center gap-3">
          <ServiceIcon service={value} />
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFile(null);
                setFileError(undefined);
                upload.reset();
                setTab(
                  value.iconKind === "lucide"
                    ? "lucide"
                    : value.iconKind === "favicon"
                      ? "favicon"
                      : "upload",
                );
              }}
            >
              {t("chooseIcon")}
            </Button>
          </DialogTrigger>
        </div>
        <ModalContent
          title={t("chooseIcon")}
          description={t("uploadHint")}
          busy={upload.isPending}
        >
          <Tabs
            value={tab}
            onValueChange={(next) => {
              if (upload.isPending) return;
              setTab(next);
              setFile(null);
              setFileError(undefined);
              upload.reset();
            }}
          >
            <TabsList className="mb-4 w-full">
              <TabsTrigger disabled={upload.isPending} value="lucide">
                {t("lucide")}
              </TabsTrigger>
              <TabsTrigger disabled={upload.isPending} value="upload">
                {t("upload")}
              </TabsTrigger>
              <TabsTrigger disabled={upload.isPending} value="favicon">
                {t("favicon")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="lucide">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("searchIcons")}
                aria-label={t("searchIcons")}
                className="mb-4"
              />
              {matches.length === 0 && (
                <p role="status" className="muted">
                  {t("noIcons")}
                </p>
              )}
              <div className="icon-grid">
                {matches.map((name) => (
                  <button
                    type="button"
                    className="icon-choice"
                    key={name}
                    aria-label={t("selectIcon", { name })}
                    aria-pressed={
                      value.iconKind === "lucide" && value.iconValue === name
                    }
                    onClick={() =>
                      pick({
                        iconKind: "lucide",
                        iconValue: name,
                        iconAssetId: null,
                      })
                    }
                  >
                    <Icon name={name} size={23} />
                    <span>{name}</span>
                  </button>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="upload">{uploaded}</TabsContent>
            <TabsContent value="favicon">{uploaded}</TabsContent>
          </Tabs>
        </ModalContent>
      </Dialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t("deleteIconTitle")}
        focusAfter={libraryHeading}
        description={t("deleteIconDescription")}
        onConfirm={async () => {
          if (!deleting) return;
          await api.deleteAsset(deleting);
          if (value.iconAssetId === deleting)
            onChange({
              iconKind: "lucide",
              iconValue: "app-window",
              iconAssetId: null,
            });
          await queryClient.invalidateQueries({ queryKey: ["admin", "icons"] });
          toast.success(t("iconDeleted"));
        }}
      />
    </>
  );
}
